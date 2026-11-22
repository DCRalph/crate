import "server-only";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";

import { inScope, type Scope } from "~/server/access";
import { db } from "~/server/db";
import { playlist, playlistPin, playlistTrack, track } from "~/server/db/app-schema";
import { playlistCoverDir } from "~/server/library/cover";
import { canSetPlaylistCover, listPlaylists } from "~/server/library/queries";

// Choosing how a playlist looks, and pinning it. Neither changes what is in
// the playlist, so both work on playlists that follow a folder on disk too.

/** Thrown when a cover can't be set, with the HTTP status that says why. */
export class CoverError extends Error {
  constructor(
    public status: 400 | 403 | 404 | 413,
    message: string,
  ) {
    super(message);
  }
}

/** The largest picture accepted, in bytes. */
export const MAX_UPLOAD = 15 * 1024 * 1024;

/** The playlist, if this scope can see it and may choose its cover. */
async function settable(scope: Scope, id: number) {
  const [row] = await listPlaylists(scope, eq(playlist.id, id));
  if (!row) throw new CoverError(404, "Playlist not found.");
  if (!canSetPlaylistCover(scope, row)) throw new CoverError(403, "Only the playlist's owner can change its cover.");
  return row;
}

/** Removes an uploaded cover's file. Nothing happens when there isn't one. */
export const forgetUpload = (upload: string | null) => (upload ? rm(path.join(playlistCoverDir, path.basename(upload)), { force: true }) : undefined);

/**
 * Makes an uploaded picture the playlist's cover. It is re-encoded here, so
 * what is stored is always a square JPEG this server made, whatever was sent.
 */
export async function uploadPlaylistCover(scope: Scope, id: number, bytes: Buffer) {
  const row = await settable(scope, id);
  if (!bytes.length) throw new CoverError(400, "Choose a picture first.");
  if (bytes.length > MAX_UPLOAD) throw new CoverError(413, "That picture is too big. The limit is 15 MB.");
  const image = await sharp(bytes)
    .rotate()
    .resize(1200, 1200, { fit: "cover" })
    .jpeg({ quality: 90 })
    .toBuffer()
    .catch(() => {
      throw new CoverError(400, "That file isn't a picture this server can read.");
    });

  // A new name each time, so nothing that cached the old picture keeps showing it.
  const name = `${id}-${Date.now()}.jpg`;
  await mkdir(playlistCoverDir, { recursive: true });
  await writeFile(path.join(playlistCoverDir, name), image);
  await db.update(playlist).set({ coverUpload: name, coverAlbumId: null }).where(eq(playlist.id, id));
  await forgetUpload(row.coverUpload);
}

/**
 * Picks a generated cover by its number, or the art of an album that is in
 * the playlist. Either way an uploaded picture is let go.
 */
export async function choosePlaylistCover(scope: Scope, id: number, choice: { seed: number } | { albumId: number }) {
  const row = await settable(scope, id);
  if ("albumId" in choice) {
    const [inside] = await db
      .select({ id: track.albumId })
      .from(playlistTrack)
      .innerJoin(track, eq(track.id, playlistTrack.trackId))
      .where(and(eq(playlistTrack.playlistId, id), eq(track.albumId, choice.albumId), inScope(track.libraryId, scope)))
      .limit(1);
    if (!inside) throw new CoverError(400, "Pick an album that is in the playlist.");
    await db.update(playlist).set({ coverAlbumId: choice.albumId, coverUpload: null }).where(eq(playlist.id, id));
  } else {
    await db.update(playlist).set({ coverSeed: choice.seed, coverAlbumId: null, coverUpload: null }).where(eq(playlist.id, id));
  }
  await forgetUpload(row.coverUpload);
}

/** Pins a playlist to the top of this person's own list, or takes it down. Anyone can pin anything they can see. */
export async function pinPlaylist(scope: Scope, id: number, pinned: boolean) {
  const [row] = await listPlaylists(scope, eq(playlist.id, id));
  if (!row) throw new CoverError(404, "Playlist not found.");
  const mine = and(eq(playlistPin.userId, scope.user.id), eq(playlistPin.playlistId, id));
  if (pinned) await db.insert(playlistPin).values({ userId: scope.user.id, playlistId: id }).onConflictDoNothing();
  else await db.delete(playlistPin).where(mine);
}
