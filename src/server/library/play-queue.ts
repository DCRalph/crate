import "server-only";
import { eq, inArray } from "drizzle-orm";

import type { Scope } from "~/server/access";
import { db } from "~/server/db";
import { playQueue, track } from "~/server/db/app-schema";
import { listTracks, visibleTrackIds } from "./queries";

// The play queue a person last saved, one per user, so that playback can move
// between their devices. The iOS app saves and reads it through tRPC and
// Subsonic clients through their own calls; all of them share the one row.
// The website does not use it yet.

/**
 * The saved queue, with the tracks the person can still see in the order they
 * were saved. Null when nothing is saved, or none of it is theirs to play now.
 */
export async function readPlayQueue(scope: Scope) {
  const [saved] = await db.select().from(playQueue).where(eq(playQueue.userId, scope.user.id));
  if (!saved?.trackIds.length) return null;
  const rows = new Map((await listTracks(scope, { where: inArray(track.id, saved.trackIds), limit: 10_000 })).map((row) => [row.id, row]));
  const tracks = saved.trackIds.flatMap((id) => rows.get(id) ?? []);
  if (!tracks.length) return null;
  return { tracks, currentId: saved.currentId, positionMs: saved.positionMs, changedBy: saved.changedBy, changedAt: saved.updatedAt };
}

/** Saves a queue as the person's one saved queue, and returns when. Tracks they can't see are left out. `client` names the device it came from. */
export async function savePlayQueue(scope: Scope, queue: { trackIds: number[]; currentId: number | null; positionMs: number }, client: string | null) {
  const values = { trackIds: await visibleTrackIds(scope, queue.trackIds), currentId: queue.currentId, positionMs: queue.positionMs, changedBy: client, updatedAt: new Date() };
  await db
    .insert(playQueue)
    .values({ userId: scope.user.id, ...values })
    .onConflictDoUpdate({ target: playQueue.userId, set: values });
  return values.updatedAt;
}
