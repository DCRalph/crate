import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, asc, desc, eq, min } from "drizzle-orm";
import sharp from "sharp";

import { env } from "~/env";
import { inScope, type Scope } from "~/server/access";
import { db } from "~/server/db";
import { album, library, playlist, playlistTrack, track } from "~/server/db/app-schema";
import { openLibrarySource, type LibrarySource } from "~/server/storage";
import { FIELDS, layoutFields, paint, paletteFor, seedOf, swatch, type Rgb } from "./gradient";
import { drawLabel, labelFor } from "./label-cover";
import { albumsWith, listPlaylists } from "./queries";

const cacheDir = path.resolve(env.DATA_DIR, "covers");
/** Covers are never served larger than this. */
const MAX_SIZE = 1200;
/**
 * Generated covers are painted at this size and resized to what was asked
 * for, so the grain is the same share of the picture at every size.
 */
const CANVAS = 512;
/** Part of every generated cover's cache key. Raise it when the generator's look changes, and the old ones are left behind. */
const GENERATOR = 1;
/** The same, for the record labels drawn for albums with no art. */
const LABEL_GENERATOR = 1;

export type CoverTarget =
  | { type: "album" | "track" | "artist"; id: number }
  /** `seed` asks for one particular generated cover, to preview it before it is chosen. */
  | { type: "playlist"; id: number; seed?: number };

/** Where pictures people upload for their playlists are kept. */
export const playlistCoverDir = path.resolve(env.DATA_DIR, "playlist-covers");

/** The album whose art stands for an album, track or artist, if the scope can see one. */
async function albumFor(type: "album" | "track" | "artist", id: number, scope: Scope): Promise<number | null> {
  const visible = inScope(album.libraryId, scope);
  if (type === "album") {
    const [row] = await db.select({ id: album.id }).from(album).where(and(eq(album.id, id), visible));
    return row?.id ?? null;
  }
  if (type === "track") {
    const [row] = await db
      .select({ id: track.albumId })
      .from(track)
      .where(and(eq(track.id, id), inScope(track.libraryId, scope)));
    return row?.id ?? null;
  }
  const [row] = await db
    .select({ id: album.id })
    .from(album)
    // Any album they are on will do, with ones filed under them first.
    .where(and(albumsWith(id), visible))
    .orderBy(desc(eq(album.artistId, id)), asc(album.year), asc(album.id))
    .limit(1);
  return row?.id ?? null;
}

/** Where an album's art is read from. `embedded` means the picture inside that audio file. */
type ArtSource = {
  source: LibrarySource;
  path: string;
  relPath?: string;
  size?: number;
  mtimeMs: number;
  embedded: boolean;
};

/** An album's art: the image file beside its tracks, or else whatever its first track carries. */
async function artSource(albumId: number): Promise<ArtSource | null> {
  const [row] = await db
    .select({
      coverPath: album.coverPath,
      libraryId: library.id,
      libraryPath: library.path,
      sourceType: library.sourceType,
      sourceConfig: library.sourceConfig,
    })
    .from(album)
    .innerJoin(library, eq(library.id, album.libraryId))
    .where(eq(album.id, albumId));
  if (!row) return null;

  const source = openLibrarySource({
    id: row.libraryId,
    path: row.libraryPath,
    sourceType: row.sourceType,
    sourceConfig: row.sourceConfig,
  });

  const coverInfo = row.coverPath ? await source.statCover(row.coverPath).catch(() => null) : null;
  if (row.coverPath && coverInfo) return { source, path: row.coverPath, mtimeMs: coverInfo.mtimeMs, embedded: false };
  const [first] = await db
    .select({ path: track.path, relPath: track.relPath, size: track.size, mtimeMs: track.mtimeMs })
    .from(track)
    .where(eq(track.albumId, albumId))
    .orderBy(asc(track.discNumber), asc(track.trackNumber), asc(track.id))
    .limit(1);
  return first ? { source, ...first, embedded: true } : null;
}

const cachePath = (key: string, extension: "jpg" | "none") =>
  path.join(cacheDir, `${createHash("sha1").update(key).digest("hex")}.${extension}`);
const exists = async (file: string) => !!(await stat(file).catch(() => null));

/** Puts a finished cover in the cache. Written beside and renamed, so a concurrent request never reads half a file. */
async function store(cached: string, image: Buffer) {
  // Unique per write: two requests for the same new cover can arrive in the same millisecond.
  const partial = `${cached}.${randomUUID()}.tmp`;
  await writeFile(partial, image);
  await rename(partial, cached);
  return cached;
}

/** A cached JPEG of an album's art at `edge` pixels, or null when the source holds no picture. */
async function albumArt(source: ArtSource, edge: number): Promise<string | null> {
  const key = `${source.path}\0${source.mtimeMs}\0${edge}`;
  const cached = cachePath(key, "jpg");
  const missing = cachePath(key, "none");
  if (await exists(cached)) return cached;
  // Files with no embedded art are remembered too, so they aren't reparsed on every request.
  if (await exists(missing)) return null;

  await mkdir(cacheDir, { recursive: true });
  let input: string | Uint8Array | null;
  if (source.embedded) {
    input = await source.source.readEmbeddedCover(source.relPath!, source.size ?? 0).catch(() => null);
  } else {
    input = await source.source.readCoverInput(source.path).catch(() => null);
  }
  if (!input) {
    await writeFile(missing, "");
    return null;
  }

  try {
    const image = await sharp(input)
      .rotate()
      .resize(edge, edge, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return await store(cached, image);
  } catch (error) {
    console.warn(`[cover] could not read art from ${source.path}:`, error);
    await writeFile(missing, "");
    return null;
  }
}

/**
 * A cached JPEG of the record label drawn for an album with no art, at `edge`
 * pixels. Keyed on the album's artist credit and name, which are all it is
 * drawn from. Null when the album is gone.
 */
async function labelArt(albumId: number, edge: number): Promise<string | null> {
  const [row] = await db.select({ artistCredit: album.artistCredit, name: album.name }).from(album).where(eq(album.id, albumId));
  if (!row) return null;
  const cached = cachePath(["label", LABEL_GENERATOR, row.artistCredit, row.name, edge].join("\0"), "jpg");
  if (await exists(cached)) return cached;

  await mkdir(cacheDir, { recursive: true });
  const svg = drawLabel(labelFor(row.artistCredit, row.name), edge);
  // Flat colours with hard edges: full colour resolution keeps the edges clean where the default would fringe them.
  return store(cached, await sharp(Buffer.from(svg)).jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer());
}

/** An album's cover: its art, or the record label drawn for it when it has none. */
async function albumCover(albumId: number, edge: number): Promise<string | null> {
  const source = await artSource(albumId);
  return (source ? await albumArt(source, edge) : null) ?? labelArt(albumId, edge);
}

/** The colour an album's art reads as, or null when it has no art or the art has no colour. */
async function artColour(source: ArtSource): Promise<Rgb | null> {
  const art = await albumArt(source, 64);
  if (!art) return null;
  try {
    return swatch(await sharp(art).resize(16, 16, { fit: "fill" }).removeAlpha().toColourspace("srgb").raw().toBuffer());
  } catch {
    return null;
  }
}

/**
 * A playlist's cover. In order: a picture its owner uploaded, the cover of an
 * album they picked, or a grainy gradient made here. `preview` skips the
 * first two and makes the gradient for that seed, so the choices can be shown
 * before one is taken. Null when the scope can't see the playlist.
 *
 * A gradient's seed is the playlist's id, its name and its chosen number, and
 * its colours come from the first few albums in it that the scope can see, or
 * from the seed when none of them has art (a label drawn for an album without
 * art is never sampled). The cache key holds everything the picture depends
 * on, so renaming the playlist, picking another number, changing which albums
 * lead it, or replacing their art each gives a new cover; nothing else does.
 */
async function playlistCover(id: number, edge: number, scope: Scope, preview?: number): Promise<string | null> {
  const [found] = await listPlaylists(scope, eq(playlist.id, id));
  if (!found) return null;

  if (preview === undefined && found.coverUpload) {
    // The stored name can only be one this server made, but it is checked anyway before it becomes a path.
    const upload = path.join(playlistCoverDir, path.basename(found.coverUpload));
    const info = await stat(upload).catch(() => null);
    if (info) {
      const cached = cachePath(["playlist-upload", upload, info.mtimeMs, edge].join("\0"), "jpg");
      if (await exists(cached)) return cached;
      await mkdir(cacheDir, { recursive: true });
      return store(cached, await sharp(upload).resize(edge, edge, { fit: "cover" }).jpeg({ quality: 88 }).toBuffer());
    }
  }
  if (preview === undefined && found.coverAlbumId !== null) {
    const [visible] = await db
      .select({ id: album.id })
      .from(album)
      .where(and(eq(album.id, found.coverAlbumId), inScope(album.libraryId, scope)));
    // The same cover the album shows everywhere else, so what was picked is what appears.
    const cover = visible ? await albumCover(visible.id, edge) : null;
    if (cover) return cover;
  }
  const number = preview ?? found.coverSeed;

  const firstAt = min(playlistTrack.position);
  const albums = await db
    .select({ id: track.albumId })
    .from(playlistTrack)
    .innerJoin(track, eq(track.id, playlistTrack.trackId))
    .where(and(eq(playlistTrack.playlistId, id), inScope(track.libraryId, scope)))
    .groupBy(track.albumId)
    .orderBy(asc(firstAt))
    .limit(FIELDS);
  const sources = (await Promise.all(albums.map((row) => artSource(row.id)))).flatMap((source) => source ?? []);

  const key = ["playlist", GENERATOR, id, found.name, number, edge, ...sources.flatMap((source) => [source.path, source.mtimeMs])].join("\0");
  const cached = cachePath(key, "jpg");
  if (await exists(cached)) return cached;

  await mkdir(cacheDir, { recursive: true });
  const colours = (await Promise.all(sources.map(artColour))).flatMap((colour) => (colour ? [colour] : []));
  // Number 0 is the cover every playlist starts with, seeded as it always was.
  const seed = seedOf(number ? `${id}\0${found.name}\0${number}` : `${id}\0${found.name}`);
  const pixels = paint(layoutFields(seed, paletteFor(seed, colours)), CANVAS);
  const image = await sharp(pixels, { raw: { width: CANVAS, height: CANVAS, channels: 3 } })
    .resize(edge, edge)
    // Grain is fine detail, which JPEG throws away first; a higher quality than art gets keeps it.
    .jpeg({ quality: 88 })
    .toBuffer();
  return store(cached, image);
}

/**
 * A JPEG of the cover for an album, track, artist or playlist, at most `size`
 * pixels on its long edge. Returns the path of a cached file, or null when
 * the scope can't see it. Albums, tracks and artists show album art, or a
 * record label drawn for an album with none (see `label-cover.ts`); a
 * playlist's cover is generated (see `playlistCover`). The cache is keyed on
 * what each picture is made from (for art, the source file and its modified
 * time), so replacing a cover needs no invalidation.
 */
export async function coverFile(target: CoverTarget, size: number | null, scope: Scope): Promise<string | null> {
  const edge = Math.min(size && size > 0 ? size : MAX_SIZE, MAX_SIZE);
  if (target.type === "playlist") return playlistCover(target.id, edge, scope, target.seed);

  const albumId = await albumFor(target.type, target.id, scope);
  return albumId ? albumCover(albumId, edge) : null;
}
