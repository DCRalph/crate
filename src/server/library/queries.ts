import "server-only";
import { and, asc, count, countDistinct, desc, eq, inArray, isNotNull, or, sql, type SQL } from "drizzle-orm";

import { inScope, type Scope } from "~/server/access";
import { db } from "~/server/db";
import {
  album,
  annotation,
  artist,
  playEvent,
  playlist,
  playlistTrack,
  track,
  type AnnotationType,
} from "~/server/db/app-schema";
import { user } from "~/server/db/schema";

// Every read of the library, for both the web API and the Subsonic API. Each
// takes a scope and only ever returns what that scope's libraries contain.

type Page = { limit?: number; offset?: number };

/** The current user's star and rating on a row of the given type. */
const annotationOf = (scope: Scope, itemType: AnnotationType, idColumn: typeof track.id | typeof album.id | typeof artist.id) =>
  and(eq(annotation.userId, scope.user.id), eq(annotation.itemType, itemType), eq(annotation.itemId, idColumn));

const trackColumns = {
  id: track.id,
  title: track.title,
  albumId: track.albumId,
  albumName: album.name,
  artistId: track.artistId,
  artistName: artist.name,
  trackNumber: track.trackNumber,
  discNumber: track.discNumber,
  year: track.year,
  genre: track.genre,
  duration: track.duration,
  bitRate: track.bitRate,
  trackGain: track.trackGain,
  albumGain: track.albumGain,
  trackPeak: track.trackPeak,
  albumPeak: track.albumPeak,
  size: track.size,
  suffix: track.suffix,
  contentType: track.contentType,
  relPath: track.relPath,
  libraryId: track.libraryId,
  createdAt: track.createdAt,
  starredAt: annotation.starredAt,
  rating: annotation.rating,
};

export type TrackRow = Awaited<ReturnType<typeof listTracks>>[number];

/** Album order: disc, then track number, then title. */
export const albumOrder = [asc(track.discNumber), asc(track.trackNumber), asc(track.title)];

export async function listTracks(scope: Scope, options: Page & { where?: SQL; orderBy?: SQL[] } = {}) {
  return db
    .select(trackColumns)
    .from(track)
    .innerJoin(album, eq(album.id, track.albumId))
    .innerJoin(artist, eq(artist.id, track.artistId))
    .leftJoin(annotation, annotationOf(scope, "track", track.id))
    .where(and(inScope(track.libraryId, scope), options.where))
    .orderBy(...(options.orderBy ?? albumOrder))
    .limit(options.limit ?? 500)
    .offset(options.offset ?? 0);
}

/** One track with the file path the media routes need, or undefined when it isn't in scope. */
export async function findTrackFile(scope: Scope, id: number) {
  const [row] = await db
    .select({
      id: track.id,
      path: track.path,
      title: track.title,
      artistName: artist.name,
      suffix: track.suffix,
      contentType: track.contentType,
      bitRate: track.bitRate,
      libraryId: track.libraryId,
    })
    .from(track)
    .innerJoin(artist, eq(artist.id, track.artistId))
    .where(and(eq(track.id, id), inScope(track.libraryId, scope)));
  return row;
}

const albumColumns = {
  id: album.id,
  name: album.name,
  artistId: album.artistId,
  artistName: artist.name,
  year: album.year,
  genre: album.genre,
  trackCount: album.trackCount,
  duration: album.duration,
  createdAt: album.createdAt,
  libraryId: album.libraryId,
  starredAt: annotation.starredAt,
  rating: annotation.rating,
};

export type AlbumRow = Awaited<ReturnType<typeof listAlbums>>[number];

export async function listAlbums(scope: Scope, options: Page & { where?: SQL; orderBy?: SQL[] } = {}) {
  return db
    .select(albumColumns)
    .from(album)
    .innerJoin(artist, eq(artist.id, album.artistId))
    .leftJoin(annotation, annotationOf(scope, "album", album.id))
    .where(and(inScope(album.libraryId, scope), options.where))
    .orderBy(...(options.orderBy ?? [asc(sql`lower(${album.name})`)]))
    .limit(options.limit ?? 50)
    .offset(options.offset ?? 0);
}

/** Albums by the user's own listening: most recently played, or most played. */
export async function listAlbumsByPlays(scope: Scope, by: "recent" | "frequent", page: Page = {}) {
  const order = by === "recent" ? desc(sql`max(${playEvent.at})`) : desc(count());
  const ranked = await db
    .select({ albumId: track.albumId })
    .from(playEvent)
    .innerJoin(track, eq(track.id, playEvent.trackId))
    .where(and(eq(playEvent.userId, scope.user.id), inScope(track.libraryId, scope)))
    .groupBy(track.albumId)
    .orderBy(order, asc(track.albumId))
    .limit(page.limit ?? 50)
    .offset(page.offset ?? 0);
  const ids = ranked.map((row) => row.albumId);
  if (!ids.length) return [];
  const albums = new Map((await listAlbums(scope, { where: inArray(album.id, ids), limit: ids.length })).map((row) => [row.id, row]));
  return ids.flatMap((id) => albums.get(id) ?? []);
}

export type ArtistRow = Awaited<ReturnType<typeof listArtists>>[number];

/** Album artists with at least one album in scope. */
export async function listArtists(scope: Scope, options: Page & { where?: SQL } = {}) {
  return db
    .select({ id: artist.id, name: artist.name, albumCount: count(album.id), starredAt: annotation.starredAt })
    .from(artist)
    .innerJoin(album, and(eq(album.artistId, artist.id), inScope(album.libraryId, scope)))
    .leftJoin(annotation, annotationOf(scope, "artist", artist.id))
    .where(options.where)
    .groupBy(artist.id, annotation.starredAt)
    .orderBy(asc(sql`lower(${artist.name})`))
    .limit(options.limit ?? 10_000)
    .offset(options.offset ?? 0);
}

const escapeLike = (text: string) => text.replace(/[\\%_]/g, "\\$&");

/** Every word of `query` must appear somewhere in `haystack`. An empty query matches everything. */
function matches(haystack: SQL, query: string) {
  const words = query.trim().split(/\s+/).filter(Boolean);
  return words.length ? and(...words.map((word) => sql`${haystack} ilike ${`%${escapeLike(word)}%`}`)) : undefined;
}

/**
 * Search across artists, albums and tracks. Tracks match on title, artist and
 * album together, so "daft around" finds Around the World.
 */
export async function search(
  scope: Scope,
  query: string,
  pages: { artists?: Page; albums?: Page; tracks?: Page } = {},
) {
  const [artists, albums, tracks] = await Promise.all([
    listArtists(scope, { where: matches(sql`${artist.name}`, query), limit: 20, ...pages.artists }),
    listAlbums(scope, { where: matches(sql`(${album.name} || ' ' || ${artist.name})`, query), limit: 20, ...pages.albums }),
    listTracks(scope, {
      where: matches(sql`(${track.title} || ' ' || ${artist.name} || ' ' || ${album.name})`, query),
      orderBy: [asc(sql`lower(${track.title})`), asc(track.id)],
      limit: 20,
      ...pages.tracks,
    }),
  ]);
  return { artists, albums, tracks };
}

export async function listGenres(scope: Scope) {
  return db
    .select({ name: sql<string>`${track.genre}`, trackCount: count(), albumCount: countDistinct(track.albumId) })
    .from(track)
    .where(and(inScope(track.libraryId, scope), isNotNull(track.genre)))
    .groupBy(track.genre)
    .orderBy(asc(track.genre));
}

/** Everything the user has starred, newest first. */
export async function listStarred(scope: Scope) {
  const [artists, albums, tracks] = await Promise.all([
    listArtists(scope, { where: isNotNull(annotation.starredAt) }),
    listAlbums(scope, { where: isNotNull(annotation.starredAt), orderBy: [desc(annotation.starredAt)], limit: 1000 }),
    listTracks(scope, { where: isNotNull(annotation.starredAt), orderBy: [desc(annotation.starredAt)], limit: 5000 }),
  ]);
  return { artists, albums, tracks };
}

/** Stars or unstars, or sets a rating (0 clears it). Fields left out are untouched. */
export async function annotate(
  userId: string,
  itemType: AnnotationType,
  itemId: number,
  change: { starred?: boolean; rating?: number },
) {
  const set = {
    ...(change.starred === undefined ? {} : { starredAt: change.starred ? new Date() : null }),
    ...(change.rating === undefined ? {} : { rating: change.rating || null }),
  };
  await db
    .insert(annotation)
    .values({ userId, itemType, itemId, ...set })
    .onConflictDoUpdate({ target: [annotation.userId, annotation.itemType, annotation.itemId], set });
}

// --- Playlists ---


/** Whether a scope may rename, fill or delete a playlist. Ones a folder rule made follow the disk, so nobody may. */
export const canEditPlaylist = (scope: Scope, row: { ownerId: string; readOnly: boolean }) =>
  !row.readOnly && (row.ownerId === scope.user.id || scope.isAdmin);

export type PlaylistRow = Awaited<ReturnType<typeof listPlaylists>>[number];

/**
 * Playlists a scope can see, with counts of the tracks it can actually play:
 * its own, all of them for admins, and public ones that hold at least one
 * track it can reach. A public playlist of music you have no access to stays
 * hidden, so its name doesn't give away what a private library holds.
 */
export async function listPlaylists(scope: Scope, where?: SQL) {
  const totals = db
    .select({
      playlistId: playlistTrack.playlistId,
      trackCount: count().as("track_count"),
      duration: sql<number>`coalesce(sum(${track.duration}), 0)::int`.as("total_duration"),
    })
    .from(playlistTrack)
    .innerJoin(track, and(eq(track.id, playlistTrack.trackId), inScope(track.libraryId, scope)))
    .groupBy(playlistTrack.playlistId)
    .as("totals");

  return db
    .select({
      id: playlist.id,
      name: playlist.name,
      ownerId: playlist.ownerId,
      ownerName: sql<string>`coalesce(${user.username}, ${user.name})`,
      isPublic: playlist.isPublic,
      readOnly: playlist.readOnly,
      comment: playlist.comment,
      folderId: playlist.folderId,
      ruleId: playlist.ruleId,
      sourcePath: playlist.sourcePath,
      fromFolder: sql<boolean>`${playlist.ruleId} is not null`,
      createdAt: playlist.createdAt,
      updatedAt: playlist.updatedAt,
      trackCount: sql<number>`coalesce(${totals.trackCount}, 0)::int`,
      duration: sql<number>`coalesce(${totals.duration}, 0)::int`,
    })
    .from(playlist)
    .innerJoin(user, eq(user.id, playlist.ownerId))
    .leftJoin(totals, eq(totals.playlistId, playlist.id))
    .where(
      and(
        scope.isAdmin
          ? undefined
          : or(eq(playlist.ownerId, scope.user.id), and(eq(playlist.isPublic, true), sql`${totals.trackCount} > 0`)),
        where,
      ),
    )
    .orderBy(asc(sql`lower(${playlist.name})`));
}

/** One playlist and its tracks in order, or null when the scope can't see it. */
export async function getPlaylist(scope: Scope, id: number) {
  const [row] = await listPlaylists(scope, eq(playlist.id, id));
  if (!row) return null;
  const tracks = await db
    .select({ ...trackColumns, position: playlistTrack.position })
    .from(playlistTrack)
    .innerJoin(track, eq(track.id, playlistTrack.trackId))
    .innerJoin(album, eq(album.id, track.albumId))
    .innerJoin(artist, eq(artist.id, track.artistId))
    .leftJoin(annotation, annotationOf(scope, "track", track.id))
    .where(and(eq(playlistTrack.playlistId, id), inScope(track.libraryId, scope)))
    .orderBy(asc(playlistTrack.position));
  return { ...row, canEdit: canEditPlaylist(scope, row), tracks };
}

/** The ids from `trackIds` that exist and are in scope, in the order given. */
export async function visibleTrackIds(scope: Scope, trackIds: number[]) {
  if (!trackIds.length) return [];
  const rows = await db
    .select({ id: track.id })
    .from(track)
    .where(and(inArray(track.id, trackIds), inScope(track.libraryId, scope)));
  const visible = new Set(rows.map((row) => row.id));
  return trackIds.filter((id) => visible.has(id));
}
