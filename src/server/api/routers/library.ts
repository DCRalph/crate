import { TRPCError } from "@trpc/server";
import { asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";

import type { Scope } from "~/server/access";
import { album, annotation, annotationTypes, artist, track } from "~/server/db/app-schema";
import { annotate, listAlbums, listAlbumsByPlays, listArtists, listTracks, search, type TrackRow } from "~/server/library/queries";
import { recordPlay } from "~/server/logs";
import { clientIp } from "~/server/request-origin";
import { protectedProcedure, router } from "../trpc";

/** A track as the web app shows it. */
export const toWebTrack = (scope: Scope, row: TrackRow) => ({
  id: row.id,
  title: row.title,
  albumId: row.albumId,
  albumName: row.albumName,
  artistId: row.artistId,
  artistName: row.artistName,
  trackNumber: row.trackNumber,
  discNumber: row.discNumber,
  duration: row.duration,
  suffix: row.suffix,
  bitRate: row.bitRate,
  starred: !!row.starredAt,
  canDownload: scope.downloadLibraryIds.has(row.libraryId),
});
export type WebTrack = ReturnType<typeof toWebTrack>;

const byAlbumName = asc(sql`lower(${album.name})`);
const albumSorts = {
  added: [desc(album.createdAt), desc(album.id)],
  name: [byAlbumName, asc(album.id)],
  artist: [asc(sql`lower(${artist.name})`), byAlbumName, asc(album.id)],
  year: [desc(sql`coalesce(${album.year}, 0)`), byAlbumName, asc(album.id)],
};

export const libraryRouter = router({
  /** A page of albums. `recent` and `frequent` follow the user's own plays. */
  albums: protectedProcedure
    .input(
      z.object({
        sort: z.enum(["added", "name", "artist", "year", "recent", "frequent"]).default("added"),
        cursor: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(120).default(60),
      }),
    )
    .query(async ({ ctx, input }) => {
      const page = { limit: input.limit, offset: input.cursor };
      const items =
        input.sort === "recent" || input.sort === "frequent"
          ? await listAlbumsByPlays(ctx.scope, input.sort, page)
          : await listAlbums(ctx.scope, { orderBy: albumSorts[input.sort], ...page });
      return { items, nextCursor: items.length === input.limit ? input.cursor + input.limit : null };
    }),

  album: protectedProcedure.input(z.object({ id: z.number().int() })).query(async ({ ctx, input }) => {
    const [found] = await listAlbums(ctx.scope, { where: eq(album.id, input.id) });
    if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Album not found." });
    const tracks = await listTracks(ctx.scope, { where: eq(track.albumId, input.id), limit: 5000 });
    return { ...found, tracks: tracks.map((row) => toWebTrack(ctx.scope, row)) };
  }),

  artists: protectedProcedure.query(({ ctx }) => listArtists(ctx.scope)),

  artist: protectedProcedure.input(z.object({ id: z.number().int() })).query(async ({ ctx, input }) => {
    const [found] = await listArtists(ctx.scope, { where: eq(artist.id, input.id) });
    if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Artist not found." });
    const albums = await listAlbums(ctx.scope, {
      where: eq(album.artistId, input.id),
      orderBy: [desc(sql`coalesce(${album.year}, 0)`), byAlbumName],
      limit: 2000,
    });
    return { ...found, albums };
  }),

  search: protectedProcedure.input(z.object({ query: z.string().trim().min(1).max(200) })).query(async ({ ctx, input }) => {
    const found = await search(ctx.scope, input.query, { tracks: { limit: 50 } });
    return { ...found, tracks: found.tracks.map((row) => toWebTrack(ctx.scope, row)) };
  }),

  /** The user's liked tracks, most recently liked first. */
  liked: protectedProcedure.query(async ({ ctx }) => {
    const tracks = await listTracks(ctx.scope, {
      where: isNotNull(annotation.starredAt),
      orderBy: [desc(annotation.starredAt), desc(track.id)],
      limit: 5000,
    });
    return tracks.map((row) => toWebTrack(ctx.scope, row));
  }),

  star: protectedProcedure
    .input(z.object({ type: z.enum(annotationTypes), id: z.number().int(), starred: z.boolean() }))
    .mutation(({ ctx, input }) => annotate(ctx.scope.user.id, input.type, input.id, { starred: input.starred })),

  /** Called by the web player once a track has mostly played. */
  recordPlay: protectedProcedure.input(z.object({ trackId: z.number().int() })).mutation(async ({ ctx, input }) => {
    const [found] = await listTracks(ctx.scope, { where: eq(track.id, input.trackId) });
    if (!found) throw new TRPCError({ code: "NOT_FOUND" });
    await recordPlay({
      userId: ctx.scope.user.id,
      username: ctx.scope.user.username,
      trackId: found.id,
      title: found.title,
      artistName: found.artistName,
      client: "Web",
      ip: clientIp(ctx.headers),
    });
  }),
});
