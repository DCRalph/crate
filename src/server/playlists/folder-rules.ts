import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "~/server/db";
import { folderRule, library, playlist, playlistTrack, track } from "~/server/db/app-schema";
import { groupTracks } from "./group-tracks";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Replaces a playlist's tracks with `trackIds`, in order. */
export async function setPlaylistTracks(tx: Tx, playlistId: number, trackIds: number[]) {
  await tx.delete(playlistTrack).where(eq(playlistTrack.playlistId, playlistId));
  for (let i = 0; i < trackIds.length; i += 1000) {
    await tx
      .insert(playlistTrack)
      .values(trackIds.slice(i, i + 1000).map((trackId, offset) => ({ playlistId, trackId, position: i + offset })));
  }
  await tx.update(playlist).set({ updatedAt: new Date() }).where(eq(playlist.id, playlistId));
}

/**
 * Applies every folder rule of a library (or just one rule). Mirror rules make
 * their playlists match the disk, removing ones whose folder is gone; seed
 * rules only create playlists that don't exist yet and never touch them again.
 * Runs after each scan and when a rule is added.
 */
export async function syncFolderRules(libraryId: number, ruleId?: number) {
  const rules = await db
    .select({ rule: folderRule, libraryName: library.name })
    .from(folderRule)
    .innerJoin(library, eq(library.id, folderRule.libraryId))
    .where(and(eq(folderRule.libraryId, libraryId), ruleId ? eq(folderRule.id, ruleId) : undefined));

  for (const { rule, libraryName } of rules) {
    const prefix = rule.path ? `${rule.path}/` : "";
    const tracks = await db
      .select({ id: track.id, relPath: track.relPath })
      .from(track)
      .where(and(eq(track.libraryId, libraryId), sql`starts_with(${track.relPath}, ${prefix})`));
    const groups = groupTracks(tracks, { path: rule.path, mode: rule.mode, libraryName });

    await db.transaction(async (tx) => {
      const existing = new Map(
        (await tx.select().from(playlist).where(eq(playlist.ruleId, rule.id))).map((row) => [row.sourcePath, row]),
      );

      for (const group of groups) {
        const current = existing.get(group.sourcePath);
        if (!current) {
          const [created] = await tx
            .insert(playlist)
            .values({
              name: group.name,
              ownerId: rule.ownerId,
              isPublic: rule.isPublic,
              ruleId: rule.id,
              sourcePath: group.sourcePath,
              readOnly: rule.sync === "mirror",
            })
            .returning({ id: playlist.id });
          await setPlaylistTracks(tx, created!.id, group.trackIds);
        } else if (rule.sync === "mirror") {
          const now = await tx
            .select({ trackId: playlistTrack.trackId })
            .from(playlistTrack)
            .where(eq(playlistTrack.playlistId, current.id))
            .orderBy(asc(playlistTrack.position));
          const same = now.length === group.trackIds.length && now.every((row, i) => row.trackId === group.trackIds[i]);
          if (!same) await setPlaylistTracks(tx, current.id, group.trackIds);
        }
      }

      if (rule.sync === "mirror") {
        const kept = new Set(groups.map((group) => group.sourcePath));
        const gone = [...existing.values()].filter((row) => !kept.has(row.sourcePath ?? "")).map((row) => row.id);
        if (gone.length) await tx.delete(playlist).where(inArray(playlist.id, gone));
      }
    });
  }
}
