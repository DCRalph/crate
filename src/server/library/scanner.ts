import "server-only";
import { readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { and, eq, inArray, notExists, sql } from "drizzle-orm";
import { parseFile } from "music-metadata";

import { recordActivity } from "~/server/activity";
import { db } from "~/server/db";
import { album, artist, library, track, type ScanResult } from "~/server/db/app-schema";
import { syncFolderRules } from "~/server/playlists/folder-rules";
import { audioTypes, coverFilePattern, suffixOf } from "./audio";

type Library = typeof library.$inferSelect;

/** What the admin page shows while a scan runs. */
export type ScanProgress = {
  libraryId: number;
  libraryName: string;
  phase: "listing" | "reading" | "cleaning";
  done: number;
  total: number;
  startedAt: number;
};

// One scan at a time, across dev hot reloads too.
const state = globalThis as unknown as { crateScan?: ScanProgress | null };

export function scanProgress(): ScanProgress | null {
  return state.crateScan ?? null;
}

type FoundFile = { path: string; size: number; mtimeMs: number; coverPath: string | null };

/** Every audio file under `root`, each with the cover image in its folder if there is one. */
async function listAudioFiles(root: string, onFound: () => void): Promise<FoundFile[]> {
  const found: FoundFile[] = [];
  // Symlinked folders are followed; this stops a link back up the tree looping forever.
  const visited = new Set<string>();

  async function walk(dir: string) {
    const real = await realpath(dir);
    if (visited.has(real)) return;
    visited.add(real);

    const entries = await readdir(dir, { withFileTypes: true });
    const cover = entries.find((entry) => coverFilePattern.test(entry.name));
    const coverPath = cover ? path.join(dir, cover.name) : null;
    const subdirs: string[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      // stat follows symlinks, so linked files and folders count as what they point to.
      const info = entry.isSymbolicLink() ? await stat(full).catch(() => null) : null;
      const isDir = info ? info.isDirectory() : entry.isDirectory();
      const isFile = info ? info.isFile() : entry.isFile();
      if (isDir) subdirs.push(full);
      else if (isFile && suffixOf(entry.name) in audioTypes) {
        const fileInfo = info ?? (await stat(full));
        found.push({ path: full, size: fileInfo.size, mtimeMs: Math.round(fileInfo.mtimeMs), coverPath });
        onFound();
      }
    }
    for (const subdir of subdirs) {
      // An unreadable folder shouldn't end the scan of everything else.
      await walk(subdir).catch((error: unknown) => console.warn(`[scan] skipped ${subdir}:`, error));
    }
  }

  await walk(root);
  return found;
}

/** Runs `work` over `items`, `limit` at a time. */
async function inPool<T>(items: T[], limit: number, work: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await work(items[next++]!);
    }),
  );
}

const nameKey = (name: string) => name.trim().toLowerCase();

/**
 * Brings one library's rows in line with its folder: new and changed files are
 * read, files that are gone are removed. Unchanged files (same size and
 * modified time) are not opened, so a rescan of a settled library is quick.
 * `full` reads every file again, for when tags were read differently before.
 */
async function scanLibrary(lib: Library, full: boolean): Promise<ScanResult> {
  const startedAt = Date.now();
  const progress: ScanProgress = { libraryId: lib.id, libraryName: lib.name, phase: "listing", done: 0, total: 0, startedAt };
  state.crateScan = progress;
  const result = { added: 0, updated: 0, removed: 0, failed: 0 };
  const finish = (error?: string): ScanResult => ({ ...result, durationMs: Date.now() - startedAt, error });

  const root = await stat(lib.path).catch(() => null);
  if (!root?.isDirectory()) return finish("The folder can't be read. Nothing was changed.");

  const files = await listAudioFiles(lib.path, () => progress.total++);
  const existing = new Map(
    (
      await db
        .select({ id: track.id, path: track.path, size: track.size, mtimeMs: track.mtimeMs, albumId: track.albumId })
        .from(track)
        .where(eq(track.libraryId, lib.id))
    ).map((row) => [row.path, row]),
  );
  // An empty folder where there used to be music is almost always an unmounted
  // drive. Removing every track would also empty playlists, so stop instead.
  if (files.length === 0 && existing.size > 0) return finish("No audio files were found, so nothing was removed. Is the drive mounted?");

  progress.phase = "reading";
  const artistIds = new Map<string, Promise<number>>();
  const albumIds = new Map<string, Promise<number>>();
  /** The cover file for each album seen this scan, including albums whose tracks didn't change. */
  const albumCovers = new Map<number, string | null>();

  const artistId = (name: string) => {
    const key = nameKey(name);
    let id = artistIds.get(key);
    if (!id) {
      id = db
        .insert(artist)
        .values({ name: name.trim(), nameKey: key })
        // A no-op update so the existing row's id comes back.
        .onConflictDoUpdate({ target: artist.nameKey, set: { nameKey: key } })
        .returning({ id: artist.id })
        .then((rows) => rows[0]!.id);
      artistIds.set(key, id);
    }
    return id;
  };

  const albumId = (values: { artistId: number; name: string; year: number | null; genre: string | null }) => {
    const key = `${values.artistId}\0${values.name}`;
    let id = albumIds.get(key);
    if (!id) {
      id = db
        .insert(album)
        .values({ ...values, libraryId: lib.id })
        .onConflictDoUpdate({
          target: [album.libraryId, album.artistId, album.name],
          // Tags win over whatever an earlier scan guessed.
          set: { year: sql`coalesce(excluded.year, ${album.year})`, genre: sql`coalesce(excluded.genre, ${album.genre})` },
        })
        .returning({ id: album.id })
        .then((rows) => rows[0]!.id);
      albumIds.set(key, id);
    }
    return id;
  };

  const seen = new Set<string>();
  await inPool(files, 6, async (file) => {
    seen.add(file.path);
    const known = existing.get(file.path);
    try {
      if (!full && known && known.size === file.size && known.mtimeMs === file.mtimeMs) {
        if (!albumCovers.get(known.albumId)) albumCovers.set(known.albumId, file.coverPath);
        return;
      }
      const tags = await readTags(file.path);
      const trackArtistId = await artistId(tags.artist);
      const trackAlbumId = await albumId({
        artistId: await artistId(tags.albumArtist),
        name: tags.album,
        year: tags.year,
        genre: tags.genre,
      });
      if (!albumCovers.get(trackAlbumId)) albumCovers.set(trackAlbumId, file.coverPath);

      const suffix = suffixOf(file.path);
      const values = {
        libraryId: lib.id,
        albumId: trackAlbumId,
        artistId: trackArtistId,
        title: tags.title,
        trackNumber: tags.trackNumber,
        discNumber: tags.discNumber,
        year: tags.year,
        genre: tags.genre,
        duration: tags.duration,
        bitRate: tags.bitRate,
        trackGain: tags.trackGain,
        albumGain: tags.albumGain,
        trackPeak: tags.trackPeak,
        albumPeak: tags.albumPeak,
        size: file.size,
        suffix,
        contentType: audioTypes[suffix] ?? "application/octet-stream",
        path: file.path,
        relPath: path.relative(lib.path, file.path).split(path.sep).join("/"),
        mtimeMs: file.mtimeMs,
      };
      await db
        .insert(track)
        .values(values)
        .onConflictDoUpdate({ target: track.path, set: { ...values, updatedAt: new Date() } });
      if (known) result.updated++;
      else result.added++;
    } catch (error) {
      result.failed++;
      console.warn(`[scan] could not read ${file.path}:`, error);
    } finally {
      progress.done++;
    }
  });

  progress.phase = "cleaning";
  const gone = [...existing.values()].filter((row) => !seen.has(row.path)).map((row) => row.id);
  for (let i = 0; i < gone.length; i += 1000) {
    await db.delete(track).where(inArray(track.id, gone.slice(i, i + 1000)));
  }
  result.removed = gone.length;

  await db
    .delete(album)
    .where(and(eq(album.libraryId, lib.id), notExists(db.select({ one: sql`1` }).from(track).where(eq(track.albumId, album.id)))));
  await db.delete(artist).where(
    and(
      notExists(db.select({ one: sql`1` }).from(album).where(eq(album.artistId, artist.id))),
      notExists(db.select({ one: sql`1` }).from(track).where(eq(track.artistId, artist.id))),
    ),
  );
  await db.execute(sql`
    update ${album} set track_count = totals.tracks, duration = totals.duration
    from (select album_id, count(*)::int as tracks, coalesce(sum(duration), 0)::int as duration from ${track} where library_id = ${lib.id} group by album_id) as totals
    where ${album.id} = totals.album_id and (${album.trackCount} <> totals.tracks or ${album.duration} <> totals.duration)
  `);

  // Covers are per folder, so they're reconciled for every album, not only changed ones.
  const albums = await db.select({ id: album.id, coverPath: album.coverPath }).from(album).where(eq(album.libraryId, lib.id));
  for (const row of albums) {
    const coverPath = albumCovers.get(row.id) ?? null;
    if (coverPath !== row.coverPath) await db.update(album).set({ coverPath }).where(eq(album.id, row.id));
  }

  return finish();
}

/** A ReplayGain number as stored: null when the tag is missing or isn't a usable number (a gain of "0" with no unit reads as minus infinity). */
const gainValue = (value: number | undefined) => (value !== undefined && Number.isFinite(value) ? value : null);

/** The tags the library needs, with fallbacks for files that have none. */
async function readTags(file: string) {
  let { common, format } = await parseFile(file, { skipCovers: true });
  // Some files (VBR MP3 without a header, raw AAC) only give a length when read through.
  if (!format.duration) ({ common, format } = await parseFile(file, { skipCovers: true, duration: true }));

  const artistName = common.artist?.trim() || common.albumartist?.trim() || "Unknown Artist";
  return {
    title: common.title?.trim() || path.basename(file, path.extname(file)),
    artist: artistName,
    albumArtist: common.albumartist?.trim() || (common.compilation ? "Various Artists" : artistName),
    // Untagged files are usually already sorted into folders, so the folder is the album.
    album: common.album?.trim() || path.basename(path.dirname(file)),
    year: common.year ?? null,
    genre: common.genre?.[0]?.trim() || null,
    trackNumber: common.track.no ?? null,
    discNumber: common.disk.no ?? null,
    duration: Math.round(format.duration ?? 0),
    bitRate: format.bitrate ? Math.round(format.bitrate / 1000) : null,
    // ReplayGain: gain in dB, peak as a ratio of full scale.
    trackGain: gainValue(common.replaygain_track_gain?.dB),
    albumGain: gainValue(common.replaygain_album_gain?.dB),
    trackPeak: gainValue(common.replaygain_track_peak?.ratio),
    albumPeak: gainValue(common.replaygain_album_peak?.ratio),
  };
}

/**
 * Scans the given libraries (all of them by default) one after another, then
 * rebuilds their folder playlists. Returns false if a scan is already running.
 * Not awaited by callers: progress is read with `scanProgress`.
 */
export function startScan(
  options: { libraryIds?: number[]; full?: boolean; actor?: { id: string | null; name: string | null } } = {},
) {
  if (state.crateScan) return false;
  // Claimed synchronously, so two requests can't both start one.
  state.crateScan = { libraryId: 0, libraryName: "", phase: "listing", done: 0, total: 0, startedAt: Date.now() };

  void (async () => {
    try {
      const libraries = await db
        .select()
        .from(library)
        .where(options.libraryIds ? inArray(library.id, options.libraryIds) : undefined)
        .orderBy(library.name);
      for (const lib of libraries) {
        const result = await scanLibrary(lib, options.full ?? false).catch(
          (error: unknown): ScanResult => ({
            added: 0,
            updated: 0,
            removed: 0,
            failed: 0,
            durationMs: 0,
            error: error instanceof Error ? error.message : "The scan failed.",
          }),
        );
        await db.update(library).set({ lastScanAt: new Date(), lastScan: result }).where(eq(library.id, lib.id));
        if (!result.error) await syncFolderRules(lib.id);
        await recordActivity({
          action: "library.scanned",
          actor: options.actor ?? { id: null, name: "Schedule" },
          target: lib.name,
          detail: result,
        });
      }
    } catch (error) {
      console.error("[scan] failed:", error);
    } finally {
      state.crateScan = null;
    }
  })();
  return true;
}
