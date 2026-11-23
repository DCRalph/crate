import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { audienceSchema, audienceTargetSchema } from "~/lib/audience";
import { canEditPlaylist, canSetPlaylistCover, canShare, getPlaylist, listPlaylists } from "~/server/library/queries";
import { AudienceError, audienceSettings, setAudience, sharePeople } from "~/server/playlists/audience";
import { choosePlaylistCover, CoverError, pinPlaylist } from "~/server/playlists/covers";
import { createFolder, deleteFolder, FolderError, getPlaylistTree, updateFolder } from "~/server/playlists/folders";
import { createPlaylist, deletePlaylist, duplicatePlaylist, PlaylistError, updatePlaylist } from "~/server/playlists/mutations";
import { protectedProcedure, router } from "../trpc";
import { toWebTrack } from "./library";

/** Runs a playlist or folder write, turning its failures into the matching tRPC errors. */
async function write<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof CoverError) {
      const codes = { 400: "BAD_REQUEST", 403: "FORBIDDEN", 404: "NOT_FOUND", 413: "PAYLOAD_TOO_LARGE" } as const;
      throw new TRPCError({ code: codes[error.status], message: error.message });
    }
    if (error instanceof AudienceError) throw new TRPCError({ code: error.reason === "not_found" ? "NOT_FOUND" : "FORBIDDEN", message: error.message });
    if (error instanceof PlaylistError || error instanceof FolderError) {
      const code =
        error.reason === "not_found" ? "NOT_FOUND" : error.reason === "read_only" ? "FORBIDDEN" : error.reason === "changed" ? "CONFLICT" : "BAD_REQUEST";
      throw new TRPCError({ code, message: error.message });
    }
    throw error;
  }
}

const id = z.number().int();
const name = z.string().trim().min(1, "Give it a name.").max(120);
const comment = z.string().trim().max(500);
const trackIds = z.array(id).max(5000);

export const playlistsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) =>
    (await listPlaylists(ctx.scope)).map((row) => ({ ...row, isMine: row.ownerId === ctx.scope.user.id })),
  ),

  /**
   * Everything the Playlists page draws: the folders and playlists this person
   * can see, flat, each naming the folder it sits in. Folders hold folders and
   * playlists; playlists are always the leaves.
   */
  tree: protectedProcedure.query(async ({ ctx }) => {
    const { folders, playlists } = await getPlaylistTree(ctx.scope);
    const mine = (ownerId: string) => ownerId === ctx.scope.user.id;
    return {
      folders: folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        parentId: folder.parentId,
        ownerName: folder.ownerName,
        isMine: mine(folder.ownerId),
        /** Made by a folder rule, so it follows the disk and can't be changed here. */
        fromDisk: folder.ruleId !== null,
        ruleId: ctx.scope.isAdmin ? folder.ruleId : null,
        canEdit: folder.ruleId === null && (mine(folder.ownerId) || ctx.scope.isAdmin),
        canShare: canShare(ctx.scope, folder),
        /** Who can listen to what is inside, unless something there sets its own. */
        audience: folder.audience,
      })),
      playlists: playlists.map((row) => ({
        ...row,
        isMine: mine(row.ownerId),
        canEdit: canEditPlaylist(ctx.scope, row),
        canSetCover: canSetPlaylistCover(ctx.scope, row),
        canShare: canShare(ctx.scope, row),
      })),
    };
  }),

  byId: protectedProcedure.input(z.object({ id })).query(async ({ ctx, input }) => {
    const found = await getPlaylist(ctx.scope, input.id);
    if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Playlist not found." });
    return {
      ...found,
      isMine: found.ownerId === ctx.scope.user.id,
      canSetCover: canSetPlaylistCover(ctx.scope, found),
      canShare: canShare(ctx.scope, found),
      tracks: found.tracks.map((row) => ({ ...toWebTrack(ctx.scope, row), position: row.position })),
    };
  }),

  /** Makes a playlist. Without an `audience` of its own it follows the folder it is made in. */
  create: protectedProcedure
    .input(
      z.object({
        name,
        comment: comment.optional(),
        audience: audienceSchema.nullable().default(null),
        folderId: id.nullable().optional(),
        trackIds: trackIds.optional(),
      }),
    )
    .mutation(({ ctx, input: { audience, ...input } }) =>
      write(async () => {
        const created = await createPlaylist(ctx.scope, input);
        if (audience) await setAudience(ctx.scope, { type: "playlist", id: created }, audience, { headers: ctx.headers });
        return created;
      }),
    ),

  update: protectedProcedure
    .input(
      z.object({
        id,
        name: name.optional(),
        comment: comment.optional(),
        folderId: id.nullable().optional(),
      }),
    )
    .mutation(({ ctx, input: { id: playlistId, ...change } }) => write(() => updatePlaylist(ctx.scope, playlistId, change))),

  addTracks: protectedProcedure
    .input(z.object({ id, trackIds: trackIds.min(1) }))
    .mutation(({ ctx, input }) => write(() => updatePlaylist(ctx.scope, input.id, { addTrackIds: input.trackIds }))),

  /** `index` is the track's place in the list as the user sees it. */
  removeTrack: protectedProcedure
    .input(z.object({ id, index: z.number().int().min(0), trackId: id }))
    .mutation(({ ctx, input }) =>
      write(() => updatePlaylist(ctx.scope, input.id, { removeIndexes: [input.index], expect: { index: input.index, trackId: input.trackId } })),
    ),

  /** Replaces the tracks with `trackIds` in that order, which is how reordering is saved. */
  setTracks: protectedProcedure
    .input(z.object({ id, trackIds }))
    .mutation(({ ctx, input }) => write(() => updatePlaylist(ctx.scope, input.id, { trackIds: input.trackIds }))),

  /** Makes an editable copy of any playlist you can see, and returns its id. */
  duplicate: protectedProcedure.input(z.object({ id })).mutation(({ ctx, input }) => write(() => duplicatePlaylist(ctx.scope, input.id))),

  delete: protectedProcedure.input(z.object({ id })).mutation(({ ctx, input }) => write(() => deletePlaylist(ctx.scope, input.id))),

  /**
   * Chooses the cover: a generated one by its number, or the art of an album
   * in the playlist. An uploaded picture goes through POST /api/cover/playlist/:id instead.
   */
  setCover: protectedProcedure
    .input(z.union([z.object({ id, seed: z.number().int().min(0).max(2_000_000_000) }), z.object({ id, albumId: id })]))
    .mutation(({ ctx, input: { id: playlistId, ...choice } }) => write(() => choosePlaylistCover(ctx.scope, playlistId, choice))),

  /** Pins a playlist to the top of your own list, or takes it down. */
  pin: protectedProcedure
    .input(z.object({ id, pinned: z.boolean() }))
    .mutation(({ ctx, input }) => write(() => pinPlaylist(ctx.scope, input.id, input.pinned))),

  /** Makes a folder. Without an `audience` of its own it follows the folder it is made in. */
  createFolder: protectedProcedure
    .input(z.object({ name, parentId: id.nullable().default(null), audience: audienceSchema.nullable().default(null) }))
    .mutation(({ ctx, input: { audience, ...input } }) =>
      write(async () => {
        const created = await createFolder(ctx.scope, input);
        if (audience) await setAudience(ctx.scope, { type: "folder", id: created }, audience, { headers: ctx.headers });
        return created;
      }),
    ),

  updateFolder: protectedProcedure
    .input(z.object({ id, name: name.optional(), parentId: id.nullable().optional() }))
    .mutation(({ ctx, input: { id: folderId, ...change } }) => write(() => updateFolder(ctx.scope, folderId, change))),

  /** Removes the folder; what was in it moves up a level. */
  deleteFolder: protectedProcedure.input(z.object({ id })).mutation(({ ctx, input }) => write(() => deleteFolder(ctx.scope, input.id))),

  /**
   * Who can listen to a playlist, a folder or (for admins) the top of what a
   * folder rule makes: its own setting and what it follows without one.
   * Only its owner and admins can ask.
   */
  audience: protectedProcedure.input(z.object({ target: audienceTargetSchema })).query(({ ctx, input }) => write(() => audienceSettings(ctx.scope, input.target))),

  /** Gives an item its own audience, or (null) makes it follow its folder again. Listen only: nobody else can edit. */
  setAudience: protectedProcedure
    .input(z.object({ target: audienceTargetSchema, audience: audienceSchema.nullable() }))
    .mutation(({ ctx, input }) => write(() => setAudience(ctx.scope, input.target, input.audience, { headers: ctx.headers }))),

  /** The people a playlist or folder can be shared with: every other account, id and name only. */
  people: protectedProcedure.query(({ ctx }) => sharePeople(ctx.scope)),
});
