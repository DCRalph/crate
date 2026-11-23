import { TRPCError } from "@trpc/server";
import { and, count, eq, inArray, max } from "drizzle-orm";
import { z } from "zod";

import { describeAudience } from "~/lib/audience";
import { db } from "~/server/db";
import { folderRule, library, playEvent, playlistFolder, track } from "~/server/db/app-schema";
import { user } from "~/server/db/schema";
import { canShare, getPlaylist, listTracks } from "~/server/library/queries";
import { folderPaths } from "~/server/playlists/folders";
import { protectedProcedure, router } from "../trpc";

const id = z.number().int();

/**
 * What the Get info dialogs show. Both start from the scoped library queries,
 * so a track or playlist the caller can't reach is simply not found, and only
 * then add the details those queries leave out.
 */
export const infoRouter = router({
  /** Everything known about one track, with this person's own listening. Only admins get the path on the server. */
  track: protectedProcedure.input(z.object({ id })).query(async ({ ctx, input }) => {
    const [found] = await listTracks(ctx.scope, { where: eq(track.id, input.id), limit: 1 });
    if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Track not found." });

    const [[file], [plays]] = await Promise.all([
      db
        .select({ libraryName: library.name, path: track.path })
        .from(track)
        .innerJoin(library, eq(library.id, track.libraryId))
        .where(eq(track.id, found.id)),
      db
        .select({ count: count(), lastAt: max(playEvent.at) })
        .from(playEvent)
        .where(and(eq(playEvent.userId, ctx.scope.user.id), eq(playEvent.trackId, found.id))),
    ]);

    return {
      id: found.id,
      title: found.title,
      artistName: found.artistName,
      albumId: found.albumId,
      albumName: found.albumName,
      trackNumber: found.trackNumber,
      discNumber: found.discNumber,
      year: found.year,
      genre: found.genre,
      duration: found.duration,
      suffix: found.suffix,
      bitRate: found.bitRate,
      size: found.size,
      libraryName: file?.libraryName ?? null,
      /** Path inside the library. */
      relPath: found.relPath,
      /** Path on the server, for admins. */
      path: ctx.scope.isAdmin ? (file?.path ?? null) : null,
      addedAt: found.createdAt,
      // ReplayGain, when the file is tagged: gain in dB, peak as a ratio of full scale.
      trackGain: found.trackGain,
      trackPeak: found.trackPeak,
      albumGain: found.albumGain,
      albumPeak: found.albumPeak,
      playCount: plays?.count ?? 0,
      lastPlayedAt: plays?.lastAt ?? null,
      likedAt: found.starredAt,
    };
  }),

  /**
   * Everything known about one playlist. The counts, length, size and
   * formats are of the tracks the caller can play, which for someone else's
   * shared playlist may be fewer than it holds. Chosen people are named only
   * to the owner and admins.
   */
  playlist: protectedProcedure.input(z.object({ id })).query(async ({ ctx, input }) => {
    const found = await getPlaylist(ctx.scope, input.id);
    if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Playlist not found." });

    const chosen = found.audience.kind === "people" && canShare(ctx.scope, found) ? found.audience.userIds : [];
    const [folders, [rule], people] = await Promise.all([
      found.folderId === null
        ? []
        : db.select({ id: playlistFolder.id, name: playlistFolder.name, parentId: playlistFolder.parentId }).from(playlistFolder),
      found.ruleId === null
        ? []
        : db
            .select({ libraryId: library.id, libraryName: library.name })
            .from(folderRule)
            .innerJoin(library, eq(library.id, folderRule.libraryId))
            .where(eq(folderRule.id, found.ruleId)),
      chosen.length ? db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, chosen)) : [],
    ]);

    const formats = new Map<string, number>();
    for (const row of found.tracks) formats.set(row.suffix, (formats.get(row.suffix) ?? 0) + 1);

    return {
      id: found.id,
      name: found.name,
      comment: found.comment,
      ownerName: found.ownerName,
      isMine: found.ownerId === ctx.scope.user.id,
      /** The folders it sits in, outermost first: "Mixes / 2025". Null at the top level. */
      folderPath: found.folderId === null ? null : (folderPaths(folders).get(found.folderId) ?? null),
      whoCanListen: describeAudience(found.audience, {
        ownerName: found.ownerId === ctx.scope.user.id ? undefined : found.ownerName,
        people: new Map(people.map((person) => [person.id, person.name])),
      }),
      /** Made by a folder rule, so it follows a folder on disk. */
      fromDisk: found.fromFolder,
      /** Which folder that is, when the caller reaches the library it is in. `path` is inside the library, "" for all of it. */
      source: rule && ctx.scope.libraryIds.includes(rule.libraryId) ? { libraryName: rule.libraryName, path: found.sourcePath ?? "" } : null,
      trackCount: found.tracks.length,
      duration: found.tracks.reduce((sum, row) => sum + row.duration, 0),
      size: found.tracks.reduce((sum, row) => sum + row.size, 0),
      /** Tracks per file format, most common first. */
      formats: [...formats].map(([suffix, tracks]) => ({ suffix, tracks })).sort((a, b) => b.tracks - a.tracks || a.suffix.localeCompare(b.suffix)),
      createdAt: found.createdAt,
      updatedAt: found.updatedAt,
    };
  }),
});
