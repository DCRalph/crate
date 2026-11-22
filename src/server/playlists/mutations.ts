import "server-only";
import { asc, eq } from "drizzle-orm";

import type { Scope } from "~/server/access";
import { db } from "~/server/db";
import { playlist, playlistTrack } from "~/server/db/app-schema";
import { canEditPlaylist, listPlaylists, visibleTrackIds } from "~/server/library/queries";
import { setPlaylistTracks } from "./folder-rules";

// Playlist writes, shared by the web API and the Subsonic API.

/** Thrown when a playlist isn't there (or isn't visible), or can't be edited by this user. */
export class PlaylistError extends Error {
  constructor(public reason: "not_found" | "read_only") {
    super(reason === "not_found" ? "Playlist not found." : "This playlist can't be edited.");
  }
}

async function editable(scope: Scope, id: number) {
  // Looked up through the same listing people browse, so "not found" means the same thing everywhere.
  const [row] = await listPlaylists(scope, eq(playlist.id, id));
  if (!row) throw new PlaylistError("not_found");
  if (!canEditPlaylist(scope, row)) throw new PlaylistError("read_only");
  return row;
}

export async function createPlaylist(scope: Scope, input: { name: string; trackIds?: number[]; isPublic?: boolean }) {
  const trackIds = await visibleTrackIds(scope, input.trackIds ?? []);
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(playlist)
      .values({ name: input.name, ownerId: scope.user.id, isPublic: input.isPublic ?? false })
      .returning({ id: playlist.id });
    await setPlaylistTracks(tx, created!.id, trackIds);
    return created!.id;
  });
}

/**
 * Changes a playlist's details and tracks. `removeIndexes` are positions in the
 * list as this user sees it (tracks they can't reach are skipped when counting),
 * removed before `addTrackIds` are appended. `trackIds` replaces the visible
 * tracks outright. Tracks the user can't see are always left in place.
 */
export async function updatePlaylist(
  scope: Scope,
  id: number,
  change: {
    name?: string;
    comment?: string;
    isPublic?: boolean;
    trackIds?: number[];
    addTrackIds?: number[];
    removeIndexes?: number[];
  },
) {
  await editable(scope, id);
  const adding = await visibleTrackIds(scope, change.trackIds ?? change.addTrackIds ?? []);

  await db.transaction(async (tx) => {
    const details = { name: change.name, comment: change.comment, isPublic: change.isPublic };
    if (Object.values(details).some((value) => value !== undefined)) {
      await tx.update(playlist).set({ ...details, updatedAt: new Date() }).where(eq(playlist.id, id));
    }
    if (!change.trackIds && !change.addTrackIds?.length && !change.removeIndexes?.length) return;

    const current = (
      await tx
        .select({ trackId: playlistTrack.trackId })
        .from(playlistTrack)
        .where(eq(playlistTrack.playlistId, id))
        .orderBy(asc(playlistTrack.position))
    ).map((row) => row.trackId);
    const visible = new Set(await visibleTrackIds(scope, current));
    const remove = new Set(change.removeIndexes);

    let seen = 0;
    const kept = current.filter((trackId) => {
      if (!visible.has(trackId)) return true;
      const index = seen++;
      return change.trackIds ? false : !remove.has(index);
    });
    await setPlaylistTracks(tx, id, [...kept, ...adding]);
  });
}

export async function deletePlaylist(scope: Scope, id: number) {
  await editable(scope, id);
  await db.delete(playlist).where(eq(playlist.id, id));
}
