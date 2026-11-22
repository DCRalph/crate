import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { getPlaylist, listPlaylists } from "~/server/library/queries";
import { createPlaylist, deletePlaylist, PlaylistError, updatePlaylist } from "~/server/playlists/mutations";
import { protectedProcedure, router } from "../trpc";
import { toWebTrack } from "./library";

/** Runs a playlist write, turning its failures into the matching tRPC errors. */
async function write<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof PlaylistError) {
      throw new TRPCError({ code: error.reason === "not_found" ? "NOT_FOUND" : "FORBIDDEN", message: error.message });
    }
    throw error;
  }
}

const id = z.number().int();
const name = z.string().trim().min(1, "Give it a name.").max(120);

export const playlistsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) =>
    (await listPlaylists(ctx.scope)).map((row) => ({ ...row, isMine: row.ownerId === ctx.scope.user.id })),
  ),

  byId: protectedProcedure.input(z.object({ id })).query(async ({ ctx, input }) => {
    const found = await getPlaylist(ctx.scope, input.id);
    if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Playlist not found." });
    return { ...found, tracks: found.tracks.map((row) => ({ ...toWebTrack(ctx.scope, row), position: row.position })) };
  }),

  create: protectedProcedure
    .input(z.object({ name, trackIds: z.array(id).max(5000).optional() }))
    .mutation(({ ctx, input }) => write(() => createPlaylist(ctx.scope, input))),

  update: protectedProcedure
    .input(z.object({ id, name: name.optional(), isPublic: z.boolean().optional() }))
    .mutation(({ ctx, input: { id: playlistId, ...change } }) => write(() => updatePlaylist(ctx.scope, playlistId, change))),

  addTracks: protectedProcedure
    .input(z.object({ id, trackIds: z.array(id).min(1).max(5000) }))
    .mutation(({ ctx, input }) => write(() => updatePlaylist(ctx.scope, input.id, { addTrackIds: input.trackIds }))),

  /** `index` is the track's place in the list as the user sees it. */
  removeTrack: protectedProcedure
    .input(z.object({ id, index: z.number().int().min(0) }))
    .mutation(({ ctx, input }) => write(() => updatePlaylist(ctx.scope, input.id, { removeIndexes: [input.index] }))),

  delete: protectedProcedure.input(z.object({ id })).mutation(({ ctx, input }) => write(() => deletePlaylist(ctx.scope, input.id))),
});
