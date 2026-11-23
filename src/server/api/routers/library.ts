import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";

import { playRanges } from "~/lib/most-played";
import { inScope, type Scope } from "~/server/access";
import { db } from "~/server/db";
import { album, annotation, annotationTypes, artist, track } from "~/server/db/app-schema";
import {
  albumsWith,
  annotate,
  listAlbums,
  listAlbumsByPlays,
  listArtists,
  listMostPlayed,
  listTracks,
  search,
  tracksWith,
  type TrackRow,
} from "~/server/library/queries";
import { waveformOf, waveformThumbs } from "~/server/library/waveform";
import { buildListQuery, listResult, type ListColumnMap } from "~/server/list/build-list-query";
import { createListInputSchema } from "~/server/list/list-input";
import { recordPlay } from "~/server/logs";
import { clientIp } from "~/server/request-origin";
import { protectedProcedure, router } from "../trpc";

/** A track as the web app shows it. */
export const toWebTrack = (scope: Scope, row: TrackRow) => ({
  id: row.id,
  title: row.title,
  albumId: row.albumId,
  albumName: row.albumName,
  // The full artist credit to show, and the first artist on it to link to.
  artistId: row.artistId,
  artistName: row.artistName,
  trackNumber: row.trackNumber,
  discNumber: row.discNumber,
  duration: row.duration,
  suffix: row.suffix,
  bitRate: row.bitRate,
  // ReplayGain in dB, for the player's volume levelling.
  trackGain: row.trackGain,
  albumGain: row.albumGain,
  starred: !!row.starredAt,
  canDownload: scope.downloadLibraryIds.has(row.libraryId),
});
export type WebTrack = ReturnType<typeof toWebTrack>;

const byAlbumName = asc(sql`lower(${album.name})`);
const albumSorts = {
  added: [desc(album.createdAt), desc(album.id)],
  name: [byAlbumName, asc(album.id)],
  artist: [asc(sql`lower(${album.artistCredit})`), byAlbumName, asc(album.id)],
  year: [desc(sql`coalesce(${album.year}, 0)`), byAlbumName, asc(album.id)],
};

/** What the Tracks page can search, sort and filter on. */
const trackListColumns = {
  title: { column: track.title, type: "text", searchable: true, sortable: true },
  artistName: { column: track.artistCredit, type: "text", searchable: true, sortable: true, filterable: true },
  albumName: { column: album.name, type: "text", searchable: true, sortable: true, filterable: true },
  genre: { column: track.genre, type: "text", sortable: true, filterable: true },
  year: { column: track.year, type: "number", sortable: true, filterable: true },
  suffix: { column: track.suffix, type: "enum", sortable: true, filterable: true },
  bitRate: { column: track.bitRate, type: "number", sortable: true, filterable: true },
  duration: { column: track.duration, type: "number", sortable: true },
  createdAt: { column: track.createdAt, type: "date", sortable: true, filterable: true },
} satisfies ListColumnMap;

export const libraryRouter = router({
  /** Every track the user can reach, a page at a time, for the Tracks page's table. */
  tracks: protectedProcedure.input(createListInputSchema({ defaultPageSize: 50 })).query(async ({ ctx, input }) => {
    const query = buildListQuery(trackListColumns, input, { defaultSort: [asc(sql`lower(${track.title})`), asc(track.id)] });
    const [rows, [total]] = await Promise.all([
      listTracks(ctx.scope, { where: query.where, orderBy: query.orderBy, limit: query.limit, offset: query.offset }),
      db
        .select({ total: count() })
        .from(track)
        .innerJoin(album, eq(album.id, track.albumId))
        .where(and(inScope(track.libraryId, ctx.scope), query.where)),
    ]);
    return listResult(
      rows.map((row) => ({ ...toWebTrack(ctx.scope, row), genre: row.genre, year: row.year, createdAt: row.createdAt })),
      total?.total ?? 0,
      input,
    );
  }),


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

  /** Everyone credited on a track or album, joint credits split into their artists. */
  artists: protectedProcedure.query(({ ctx }) => listArtists(ctx.scope)),

  /** One artist with every album they are on, including other people's, and every track they are credited on. */
  artist: protectedProcedure.input(z.object({ id: z.number().int() })).query(async ({ ctx, input }) => {
    const [found] = await listArtists(ctx.scope, { where: eq(artist.id, input.id) });
    if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Artist not found." });
    const albums = await listAlbums(ctx.scope, {
      where: albumsWith(input.id),
      orderBy: [desc(sql`coalesce(${album.year}, 0)`), byAlbumName],
      limit: 2000,
    });
    const tracks = await listTracks(ctx.scope, {
      where: tracksWith(input.id),
      orderBy: [asc(sql`lower(${track.title})`), asc(track.id)],
      limit: 2000,
    });
    return { ...found, albums, tracks: tracks.map((row) => toWebTrack(ctx.scope, row)) };
  }),

  search: protectedProcedure.input(z.object({ query: z.string().trim().min(1).max(200) })).query(async ({ ctx, input }) => {
    const found = await search(ctx.scope, input.query, { tracks: { limit: 50 } });
    return { ...found, tracks: found.tracks.map((row) => toWebTrack(ctx.scope, row)) };
  }),

  /** What the home page opens with: the albums this person last played, the newest in the library, and the ones they play most. */
  home: protectedProcedure.query(async ({ ctx }) => {
    const [recent, added, frequent] = await Promise.all([
      listAlbumsByPlays(ctx.scope, "recent", { limit: 12 }),
      listAlbums(ctx.scope, { orderBy: albumSorts.added, limit: 12 }),
      listAlbumsByPlays(ctx.scope, "frequent", { limit: 12 }),
    ]);
    return { recent, added, frequent };
  }),

  /** A track's loudness along its length, 0 to 255 a slice, for the deck's waveform. Null when the file can't be read. */
  waveform: protectedProcedure.input(z.object({ trackId: z.number().int() })).query(async ({ ctx, input }) => {
    const [found] = await listTracks(ctx.scope, { where: eq(track.id, input.trackId) });
    if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Track not found." });
    return waveformOf(found.id);
  }),

  /**
   * Small waveforms for a page of track rows, in one query: 64 numbers from 0 to 255 a track, or null for one
   * with none yet (or out of reach). Only what scans stored is read; nothing is decoded on demand.
   */
  waveformThumbs: protectedProcedure
    .input(z.object({ trackIds: z.array(z.number().int()).max(500) }))
    .query(({ ctx, input }) => waveformThumbs(ctx.scope, input.trackIds)),

  /** The user's liked tracks, most recently liked first. */
  liked: protectedProcedure.query(async ({ ctx }) => {
    const tracks = await listTracks(ctx.scope, {
      where: isNotNull(annotation.starredAt),
      orderBy: [desc(annotation.starredAt), desc(track.id)],
      limit: 5000,
    });
    return tracks.map((row) => toWebTrack(ctx.scope, row));
  }),

  /** The user's most played tracks over a range, each with its play count in that range, for the Most played page. */
  mostPlayed: protectedProcedure.input(z.object({ range: z.enum(playRanges) })).query(async ({ ctx, input }) => {
    const tracks = await listMostPlayed(ctx.scope, input.range);
    return tracks.map((row) => ({ ...toWebTrack(ctx.scope, row), plays: row.plays }));
  }),

  star: protectedProcedure
    .input(z.object({ type: z.enum(annotationTypes), id: z.number().int(), starred: z.boolean() }))
    .mutation(({ ctx, input }) => annotate(ctx.scope.user.id, input.type, input.id, { starred: input.starred })),

  /** Called by the web player once a track has mostly played. */
  recordPlay: protectedProcedure.input(z.object({ trackId: z.number().int() })).mutation(async ({ ctx, input }) => {
    const [found] = await listTracks(ctx.scope, { where: eq(track.id, input.trackId) });
    if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Track not found." });
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
