import "server-only";
import { asc, eq } from "drizzle-orm";

import { sameAudience, type Audience } from "~/lib/audience";
import type { Scope } from "~/server/access";
import type { ActivityOrigin } from "~/server/activity";
import { db } from "~/server/db";
import { playlist, playlistTrack } from "~/server/db/app-schema";
import { canEditPlaylist, getPlaylist, listPlaylists, loadAudiences, visibleTrackIds } from "~/server/library/queries";
import { logMove, logNewAudience, placeName, settleAudience } from "./audience";
import { setPlaylistTracks } from "./folder-rules";
import { forgetUpload } from "./covers";
import { assertPlace } from "./folders";

// Playlist writes, shared by the web API and the Subsonic API.

/** Thrown when a playlist isn't there (or isn't visible), or can't be edited by this user. */
export class PlaylistError extends Error {
  constructor(public reason: "not_found" | "read_only" | "changed") {
    super(
      reason === "not_found" ? "Playlist not found." : reason === "read_only" ? "This playlist can't be edited." : "The playlist changed. Try again.",
    );
  }
}

async function editable(scope: Scope, id: number) {
  // Looked up through the same listing people browse, so "not found" means the same thing everywhere.
  const [row] = await listPlaylists(scope, eq(playlist.id, id));
  if (!row) throw new PlaylistError("not_found");
  if (!canEditPlaylist(scope, row)) throw new PlaylistError("read_only");
  return row;
}

/**
 * Makes a playlist for this user, optionally in one of their folders and
 * already holding tracks. Without an `audience` of its own it follows its
 * folder. One it is given is saved with the row, so nobody else ever sees it
 * without it, and logged.
 */
export async function createPlaylist(
  scope: Scope,
  input: { name: string; trackIds?: number[]; comment?: string; folderId?: number | null; audience?: Audience | null },
  from: ActivityOrigin = {},
) {
  await assertPlace(scope.user.id, input.folderId ?? null);
  const [trackIds, own] = await Promise.all([visibleTrackIds(scope, input.trackIds ?? []), settleAudience(input.audience ?? null, scope.user.id)]);
  const id = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(playlist)
      .values({
        name: input.name,
        ownerId: scope.user.id,
        comment: input.comment || null,
        folderId: input.folderId ?? null,
        audience: own.audience,
      })
      .returning({ id: playlist.id });
    await setPlaylistTracks(tx, created!.id, trackIds);
    return created!.id;
  });
  await logNewAudience(scope, { type: "playlist", id }, input.name, own, from);
  return id;
}

/**
 * Changes a playlist's details, its folder and its tracks. `removeIndexes` are
 * positions in the list as this user sees it (tracks they can't reach are
 * skipped when counting), removed before `addTrackIds` are appended.
 * `trackIds` replaces the visible tracks outright. Tracks the user can't see
 * are always left in place. `expect` names the track the caller believes is
 * at a position; if the list has moved on since they looked, nothing is
 * changed. Who can listen is `setAudience`'s, since it is logged and allowed
 * on playlists from disk too, but a move that changes it is logged here.
 */
export async function updatePlaylist(
  scope: Scope,
  id: number,
  change: {
    name?: string;
    comment?: string;
    folderId?: number | null;
    trackIds?: number[];
    addTrackIds?: number[];
    removeIndexes?: number[];
    expect?: { index: number; trackId: number };
  },
  from: ActivityOrigin = {},
) {
  const row = await editable(scope, id);
  const to = change.folderId;
  if (to !== undefined) await assertPlace(row.ownerId, to);
  // Following its folder, a playlist moved to another can gain or lose listeners.
  const move =
    to === undefined || to === row.folderId ? null : { to, now: (await loadAudiences()).playlist({ folderId: to, ruleId: row.ruleId, audience: row.ownAudience }) };
  const adding = await visibleTrackIds(scope, change.trackIds ?? change.addTrackIds ?? []);

  await db.transaction(async (tx) => {
    const details = { name: change.name, comment: change.comment, folderId: change.folderId };
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
      if (change.expect?.index === index && change.expect.trackId !== trackId) throw new PlaylistError("changed");
      return change.trackIds ? false : !remove.has(index);
    });
    if (change.expect && change.expect.index >= seen) throw new PlaylistError("changed");
    await setPlaylistTracks(tx, id, [...kept, ...adding]);
  });

  if (move && !sameAudience(row.audience, move.now)) {
    const moved = `from ${await placeName(row.folderId)} to ${await placeName(move.to)}`;
    await logMove(scope, { type: "playlist", id }, row, { moved, was: row.audience, now: move.now }, from);
  }
}

/**
 * Copies a playlist the scope can see into one of its own, with the tracks it
 * can reach. This is how a playlist that follows the disk becomes one to edit.
 */
export async function duplicatePlaylist(scope: Scope, id: number) {
  const found = await getPlaylist(scope, id);
  if (!found) throw new PlaylistError("not_found");
  return createPlaylist(scope, {
    name: `${found.name} copy`,
    comment: found.comment ?? undefined,
    trackIds: found.tracks.map((row) => row.id),
  });
}

export async function deletePlaylist(scope: Scope, id: number) {
  const row = await editable(scope, id);
  await db.delete(playlist).where(eq(playlist.id, id));
  await forgetUpload(row.coverUpload);
}
