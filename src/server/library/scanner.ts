import "server-only";
import path from "node:path";
import { and, asc, eq, inArray, notExists, sql } from "drizzle-orm";

import { recordActivity } from "~/server/activity";
import { db } from "~/server/db";
import { album, artist, library, track, trackArtist, type ScanResult } from "~/server/db/app-schema";
import { syncFolderRules } from "~/server/playlists/folder-rules";
import { openLibrarySource, type LibrarySource, type ScannedFile } from "~/server/storage";
import { artistKey, fromFileName, readCredit, splitJoint, type Credit } from "./artists";
import { audioTypes, suffixOf } from "./audio";
import { drawWaveforms } from "./waveform";

type Library = typeof library.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** What the admin page shows while a scan runs. */
export type ScanProgress = {
  libraryId: number;
  libraryName: string;
  phase: "listing" | "reading" | "cleaning" | "waveforms";
  done: number;
  total: number;
  startedAt: number;
};

// One scan at a time, across dev hot reloads too.
const state = globalThis as unknown as { crateScan?: ScanProgress | null };

export function scanProgress(): ScanProgress | null {
  return state.crateScan ?? null;
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

/** The id of the artist with this name, added if it is new. Spellings that differ only in case are one artist. */
async function addArtist(name: string) {
  const key = artistKey(name);
  const [row] = await db
    .insert(artist)
    .values({ name: name.trim(), nameKey: key })
    // A no-op update so the existing row's id comes back.
    .onConflictDoUpdate({ target: artist.nameKey, set: { nameKey: key } })
    .returning({ id: artist.id });
  return row!.id;
}

/** Replaces who a track is credited to, in order. The caller keeps `track.artistId` as the first of them. */
async function setTrackArtists(tx: Tx, trackId: number, artistIds: number[]) {
  await tx.delete(trackArtist).where(eq(trackArtist.trackId, trackId));
  await tx.insert(trackArtist).values(artistIds.map((artistId, position) => ({ trackId, artistId, position })));
}

/** Removes artists nothing is credited to any more. Run after a scan, and after a library is removed. */
export async function removeUnusedArtists() {
  const unused = (table: typeof album | typeof track | typeof trackArtist) =>
    notExists(db.select({ one: sql`1` }).from(table).where(eq(table.artistId, artist.id)));
  await db.delete(artist).where(and(unused(album), unused(track), unused(trackArtist)));
}

/**
 * Splits joint artists the library can now tell apart. The scanner only
 * splits a credit on separators that never sit inside a name, so "Skrillex &
 * Feid" starts as one artist. Here each name with an "&" or "and" is checked
 * against the other artists, and when a part is an artist in its own right the
 * tracks and albums of the joint one are credited to its parts instead and it
 * is removed. It works from the database alone and runs after every scan, so
 * the order files turn up in makes no difference: "A & B" is split by whichever
 * scan first sees "A" alone, and stays split after that.
 */
async function splitJointArtists() {
  // Until nothing changes: the parts of one split can be what another was waiting for.
  for (;;) {
    const artists = await db.select({ id: artist.id, name: artist.name, nameKey: artist.nameKey }).from(artist);
    const keys = new Set(artists.map((row) => row.nameKey));
    const joint = artists.flatMap((row) => {
      const names = splitJoint(row.name, (name) => keys.has(artistKey(name)));
      return names.length > 1 ? [{ id: row.id, names }] : [];
    });
    if (!joint.length) return;

    for (const { id, names } of joint) {
      const partIds: number[] = [];
      for (const name of names) partIds.push(await addArtist(name));
      await db.transaction(async (tx) => {
        const credited = await tx.select({ trackId: trackArtist.trackId }).from(trackArtist).where(eq(trackArtist.artistId, id));
        for (const { trackId } of credited) {
          const current = await tx
            .select({ artistId: trackArtist.artistId })
            .from(trackArtist)
            .where(eq(trackArtist.trackId, trackId))
            .orderBy(asc(trackArtist.position));
          // The parts take the joint artist's place. A part already credited keeps its earlier place.
          const artistIds = [...new Set(current.flatMap((row) => (row.artistId === id ? partIds : [row.artistId])))];
          await setTrackArtists(tx, trackId, artistIds);
          await tx.update(track).set({ artistId: artistIds[0]! }).where(eq(track.id, trackId));
        }
        await tx.update(album).set({ artistId: partIds[0]! }).where(eq(album.artistId, id));
        await tx.delete(artist).where(eq(artist.id, id));
      });
    }
  }
}

/** What a scan did, and whether it reached the library. One that didn't changed nothing. */
type Scanned = { result: ScanResult; reached: boolean };

/**
 * Brings one library's rows in line with its folder: new and changed files are
 * read, files that are gone are removed. Unchanged files (same size and
 * modified time) are not opened, so a rescan of a settled library is quick.
 * `full` reads every file again, for when tags were read differently before.
 */
async function scanLibrary(lib: Library, full: boolean): Promise<Scanned> {
  const startedAt = Date.now();
  const progress: ScanProgress = { libraryId: lib.id, libraryName: lib.name, phase: "listing", done: 0, total: 0, startedAt };
  state.crateScan = progress;
  const result = { added: 0, updated: 0, removed: 0, failed: 0 };
  const finish = (error?: string, reached = true): Scanned => ({ result: { ...result, durationMs: Date.now() - startedAt, error }, reached });

  let source: LibrarySource;
  try {
    source = openLibrarySource(lib);
    await source.check();
  } catch (error) {
    const reason = error instanceof Error ? error.message : "The library source can't be read.";
    console.error(`[scan] source check failed for "${lib.name}"`, {
      libraryId: lib.id,
      sourceType: lib.sourceType,
      path: lib.path,
      error: reason,
    });
    return finish(`${reason} Nothing was changed.`, false);
  }

  const files = await source.listAudioFiles(() => progress.total++);
  const existing = new Map(
    (
      await db
        .select({ id: track.id, path: track.path, size: track.size, mtimeMs: track.mtimeMs, albumId: track.albumId })
        .from(track)
        .where(eq(track.libraryId, lib.id))
    ).map((row) => [row.path, row]),
  );
  // An empty source where there used to be music is almost always an unmounted
  // drive, disconnected share, or wrong bucket prefix. Removing every track
  // would also empty playlists, so stop instead.
  if (files.length === 0 && existing.size > 0) return finish("No audio files were found, so nothing was removed. Is the source reachable?", false);

  progress.phase = "reading";
  const artistIds = new Map<string, Promise<number>>();
  const albumIds = new Map<string, Promise<number>>();
  /** The cover file for each album seen this scan, including albums whose tracks didn't change. */
  const albumCovers = new Map<number, string | null>();

  const artistId = (name: string) => {
    const key = artistKey(name);
    let id = artistIds.get(key);
    if (!id) {
      id = addArtist(name);
      artistIds.set(key, id);
    }
    return id;
  };

  const albumId = (values: { artistId: number; artistCredit: string; name: string; year: number | null; genre: string | null }) => {
    const key = `${values.artistCredit}\0${values.name}`;
    let id = albumIds.get(key);
    if (!id) {
      id = db
        .insert(album)
        .values({ ...values, libraryId: lib.id })
        .onConflictDoUpdate({
          target: [album.libraryId, album.artistCredit, album.name],
          // Tags win over whatever an earlier scan guessed.
          set: {
            artistId: values.artistId,
            year: sql`coalesce(excluded.year, ${album.year})`,
            genre: sql`coalesce(excluded.genre, ${album.genre})`,
          },
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
      const tags = await readTags(source, file, lib.name);
      const trackArtistIds = await Promise.all(tags.artist.names.map(artistId));
      const trackAlbumId = await albumId({
        artistId: await artistId(tags.albumArtist.names[0]!),
        artistCredit: tags.albumArtist.credit,
        name: tags.album,
        year: tags.year,
        genre: tags.genre,
      });
      if (!albumCovers.get(trackAlbumId)) albumCovers.set(trackAlbumId, file.coverPath);

      const suffix = suffixOf(file.relPath);
      const values = {
        libraryId: lib.id,
        albumId: trackAlbumId,
        artistId: trackArtistIds[0]!,
        artistCredit: tags.artist.credit,
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
        relPath: file.relPath,
        mtimeMs: file.mtimeMs,
      };
      await db.transaction(async (tx) => {
        const [saved] = await tx
          .insert(track)
          .values(values)
          .onConflictDoUpdate({ target: track.path, set: { ...values, updatedAt: new Date() } })
          .returning({ id: track.id });
        await setTrackArtists(tx, saved!.id, trackArtistIds);
      });
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
  // Joint artists are split before unused ones are removed. A full rescan credits "A & B" whole
  // again for a moment, and B, known only from that split, has to still be there to keep its id.
  await splitJointArtists();
  await removeUnusedArtists();
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

/**
 * A number from a tag as stored: null when the tag is missing or isn't a usable
 * number. A ReplayGain of "0" with no unit reads as minus infinity, and a year
 * that isn't a date reads as NaN, which would fail the whole file.
 */
const tagNumber = (value: number | undefined) => (value !== undefined && Number.isFinite(value) ? value : null);

/** A credit to one artist. */
const named = (name: string): Credit => ({ credit: name, names: [name] });

/**
 * The tags the library needs, with fallbacks for files that have none. Both
 * credits come with everyone on them: from the tags' own list when a file has
 * one, otherwise from splitting the one string (see artists.ts).
 */
async function readTags(source: LibrarySource, file: ScannedFile, libraryName: string) {
  const mimeType = audioTypes[suffixOf(file.relPath)];
  let { common, format } = await source.parseMetadata(file.relPath, { size: file.size, mimeType }, { skipCovers: true });
  // Some files (VBR MP3 without a header, raw AAC) only give a length when read through.
  if (!format.duration) ({ common, format } = await source.parseMetadata(file.relPath, { size: file.size, mimeType }, { skipCovers: true, duration: true }));

  // A file with no tags usually still says who and what it is in its name.
  const baseName = path.posix.basename(file.relPath, path.posix.extname(file.relPath));
  const parentDir = path.posix.dirname(file.relPath);
  const folderName = parentDir === "." ? libraryName : path.posix.basename(parentDir);
  const fileName = fromFileName(baseName);
  const albumArtist = readCredit(common.albumartist, common.albumartists);
  const tagged = readCredit(common.artist, common.artists) ?? albumArtist;
  const artist = tagged ?? readCredit(fileName.artist) ?? named("Unknown Artist");
  const album = common.album?.trim();
  const titleTag = common.title?.trim();
  // On a file with no artist tag, a title tag that is the file's name over again ("1. Artist - Title") is read the way the name is.
  const fromTitle = titleTag && !tagged ? fromFileName(titleTag) : null;
  return {
    title: fromTitle?.artist && fromTitle.artist === fileName.artist ? fromTitle.title : titleTag || fileName.title,
    artist,
    // With no album tag the folder is the album, and a folder of loose files is by whoever is in it.
    albumArtist: albumArtist ?? (common.compilation || !album ? named("Various Artists") : artist),
    // Untagged files are usually already sorted into folders, so the folder is the album.
    album: album || folderName,
    year: tagNumber(common.year),
    genre: common.genre?.[0]?.trim() || null,
    trackNumber: common.track.no ?? null,
    discNumber: common.disk.no ?? null,
    duration: Math.round(format.duration ?? 0),
    bitRate: format.bitrate ? Math.round(format.bitrate / 1000) : null,
    // ReplayGain: gain in dB, peak as a ratio of full scale.
    trackGain: tagNumber(common.replaygain_track_gain?.dB),
    albumGain: tagNumber(common.replaygain_album_gain?.dB),
    trackPeak: tagNumber(common.replaygain_track_peak?.ratio),
    albumPeak: tagNumber(common.replaygain_album_peak?.ratio),
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
        const { result, reached } = await scanLibrary(lib, options.full ?? false).catch(
          (error: unknown): Scanned => ({
            result: { added: 0, updated: 0, removed: 0, failed: 0, durationMs: 0, error: error instanceof Error ? error.message : "The scan failed." },
            // It got past checking the source, so the library was there.
            reached: true,
          }),
        );
        await db.update(library).set({ lastScanAt: new Date(), lastScan: result }).where(eq(library.id, lib.id));
        // Neither step stops the scans of the libraries after this one.
        if (!result.error) await syncFolderRules(lib.id).catch((error: unknown) => console.error(`[scan] folder rules failed for "${lib.name}":`, error));
        // Last, and after the scan's result is saved: the tracks are all usable already, this only draws them.
        // A scan that stopped on an error still got as far as the library, so only one that couldn't reach it is skipped.
        if (reached) {
          await drawWaveforms(lib.id, {
            full: options.full ?? false,
            onProgress: (done, total) => {
              state.crateScan = { libraryId: lib.id, libraryName: lib.name, phase: "waveforms", done, total, startedAt: state.crateScan?.startedAt ?? Date.now() };
            },
          }).catch((error: unknown) => console.error(`[waveform] drawing failed for "${lib.name}":`, error));
        }
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
