import "server-only";
import { createHash } from "node:crypto";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, asc, eq } from "drizzle-orm";
import { parseFile, selectCover } from "music-metadata";
import sharp from "sharp";

import { env } from "~/env";
import { inScope, type Scope } from "~/server/access";
import { db } from "~/server/db";
import { album, playlistTrack, track } from "~/server/db/app-schema";

const cacheDir = path.resolve(env.DATA_DIR, "covers");
/** Covers are never served larger than this. */
const MAX_SIZE = 1200;

export type CoverTarget = { type: "album" | "track" | "artist" | "playlist"; id: number };

/** The album whose art stands for the target, if the scope can see one. */
async function albumFor(target: CoverTarget, scope: Scope): Promise<number | null> {
  const visible = inScope(album.libraryId, scope);
  if (target.type === "album") {
    const [row] = await db.select({ id: album.id }).from(album).where(and(eq(album.id, target.id), visible));
    return row?.id ?? null;
  }
  if (target.type === "track") {
    const [row] = await db
      .select({ id: track.albumId })
      .from(track)
      .where(and(eq(track.id, target.id), inScope(track.libraryId, scope)));
    return row?.id ?? null;
  }
  if (target.type === "artist") {
    const [row] = await db
      .select({ id: album.id })
      .from(album)
      .where(and(eq(album.artistId, target.id), visible))
      .orderBy(asc(album.year), asc(album.id))
      .limit(1);
    return row?.id ?? null;
  }
  const [row] = await db
    .select({ id: track.albumId })
    .from(playlistTrack)
    .innerJoin(track, eq(track.id, playlistTrack.trackId))
    .where(and(eq(playlistTrack.playlistId, target.id), inScope(track.libraryId, scope)))
    .orderBy(asc(playlistTrack.position))
    .limit(1);
  return row?.id ?? null;
}

/**
 * A JPEG of the cover for an album, track, artist or playlist, at most `size`
 * pixels on its long edge. Returns the path of a cached file, or null when
 * there is no art (or no access). The cache is keyed on the source file and its
 * modified time, so replacing a cover needs no invalidation.
 */
export async function coverFile(target: CoverTarget, size: number | null, scope: Scope): Promise<string | null> {
  const albumId = await albumFor(target, scope);
  if (!albumId) return null;

  const [row] = await db.select({ coverPath: album.coverPath }).from(album).where(eq(album.id, albumId));
  const coverInfo = row?.coverPath ? await stat(row.coverPath).catch(() => null) : null;
  let source: { path: string; mtimeMs: number; embedded: boolean };
  if (row?.coverPath && coverInfo) {
    source = { path: row.coverPath, mtimeMs: Math.round(coverInfo.mtimeMs), embedded: false };
  } else {
    const [first] = await db
      .select({ path: track.path, mtimeMs: track.mtimeMs })
      .from(track)
      .where(eq(track.albumId, albumId))
      .orderBy(asc(track.discNumber), asc(track.trackNumber), asc(track.id))
      .limit(1);
    if (!first) return null;
    source = { ...first, embedded: true };
  }

  const edge = Math.min(size && size > 0 ? size : MAX_SIZE, MAX_SIZE);
  const key = createHash("sha1").update(`${source.path}\0${source.mtimeMs}\0${edge}`).digest("hex");
  const cached = path.join(cacheDir, `${key}.jpg`);
  const missing = path.join(cacheDir, `${key}.none`);
  if (await stat(cached).catch(() => null)) return cached;
  // Files with no embedded art are remembered too, so they aren't reparsed on every request.
  if (await stat(missing).catch(() => null)) return null;

  await mkdir(cacheDir, { recursive: true });
  let input: string | Uint8Array = source.path;
  if (source.embedded) {
    const picture = selectCover((await parseFile(source.path).catch(() => null))?.common.picture);
    if (!picture) {
      await writeFile(missing, "");
      return null;
    }
    input = picture.data;
  }

  try {
    const image = await sharp(input)
      .rotate()
      .resize(edge, edge, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    // Written beside and renamed, so a concurrent request never reads half a file.
    const partial = `${cached}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(partial, image);
    await rename(partial, cached);
    return cached;
  } catch (error) {
    console.warn(`[cover] could not read art from ${source.path}:`, error);
    await writeFile(missing, "");
    return null;
  }
}
