import "server-only";
import { and, asc, count, countDistinct, desc, eq, gte, inArray, isNotNull, sql, type AnyColumn, type SQL } from "drizzle-orm";

import { playsSince, type PlayRange } from "~/lib/most-played";
import { inScope, type Scope } from "~/server/access";
import { db, type Db } from "~/server/db";
import {
  album,
  annotation,
  artist,
  folderRule,
  library,
  playEvent,
  playlist,
  playlistFolder,
  playlistPin,
  playlistTrack,
  ruleItemAudience,
  track,
  trackArtist,
  type AnnotationType,
} from "~/server/db/app-schema";
import { user } from "~/server/db/schema";
import { seenBy } from "~/lib/audience";
import { audienceResolver, canListen, type AudienceResolver } from "~/server/playlists/resolve-audience";

// Every read of the library, for both the web API and the Subsonic API. Each
// takes a scope and only ever returns what that scope's libraries contain.

type Page = { limit?: number; offset?: number };

/** The current user's star and rating on a row of the given type. */
const annotationOf = (scope: Scope, itemType: AnnotationType, idColumn: typeof track.id | typeof album.id | typeof artist.id) =>
  and(eq(annotation.userId, scope.user.id), eq(annotation.itemType, itemType), eq(annotation.itemId, idColumn));

/** Everyone credited on a track, in the order the credit names them. */
const creditedArtists = sql<{ id: number; name: string }[]>`(
  select coalesce(json_agg(json_build_object('id', credited.id, 'name', credited.name) order by credit.position), '[]'::json)
  from ${trackArtist} as credit inner join ${artist} as credited on credited.id = credit.artist_id
  where credit.track_id = ${track.id}
)`;

const trackColumns = {
  id: track.id,
  title: track.title,
  albumId: track.albumId,
  albumName: album.name,
  /** The first credited artist. */
  artistId: track.artistId,
  /** The artist line as shown, joint credits and all. */
  artistName: track.artistCredit,
  artists: creditedArtists,
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
    .leftJoin(annotation, annotationOf(scope, "track", track.id))
    .where(and(inScope(track.libraryId, scope), options.where))
    .orderBy(...(options.orderBy ?? albumOrder))
    .limit(options.limit ?? 500)
    .offset(options.offset ?? 0);
}

/** One track with the file and library source details the media routes need, or undefined when it isn't in scope. */
export async function findTrackFile(scope: Scope, id: number) {
  const [row] = await db
    .select({
      id: track.id,
      path: track.path,
      relPath: track.relPath,
      size: track.size,
      mtimeMs: track.mtimeMs,
      title: track.title,
      artistName: track.artistCredit,
      suffix: track.suffix,
      contentType: track.contentType,
      bitRate: track.bitRate,
      libraryId: track.libraryId,
      libraryPath: library.path,
      sourceType: library.sourceType,
      sourceConfig: library.sourceConfig,
    })
    .from(track)
    .innerJoin(library, eq(library.id, track.libraryId))
    .where(and(eq(track.id, id), inScope(track.libraryId, scope)));
  return row;
}

const albumColumns = {
  id: album.id,
  name: album.name,
  /** The first artist on the album artist credit. */
  artistId: album.artistId,
  /** The album artist as shown. */
  artistName: album.artistCredit,
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

export type MostPlayedRow = Awaited<ReturnType<typeof listMostPlayed>>[number];

/**
 * The user's own most played tracks over a range, each with how many times
 * they played it in that range and when they last did. Most plays first, then
 * the one played most recently. Worked out from their plays on every read, so
 * it is never stale and nothing is stored. Read by the Most played page and
 * the Subsonic playlist of the same name.
 */
export async function listMostPlayed(scope: Scope, range: PlayRange, limit = 50) {
  const since = playsSince(range);
  const plays = db
    .select({
      trackId: playEvent.trackId,
      plays: sql<number>`count(*)::int`.as("plays"),
      // Never null: every group has a play.
      lastPlayedAt: sql<Date>`max(${playEvent.at})`.mapWith(playEvent.at).as("last_played_at"),
    })
    .from(playEvent)
    .where(and(eq(playEvent.userId, scope.user.id), since ? gte(playEvent.at, since) : undefined))
    .groupBy(playEvent.trackId)
    .as("plays");

  return db
    .select({ ...trackColumns, plays: plays.plays, lastPlayedAt: plays.lastPlayedAt })
    .from(plays)
    .innerJoin(track, eq(track.id, plays.trackId))
    .innerJoin(album, eq(album.id, track.albumId))
    .leftJoin(annotation, annotationOf(scope, "track", track.id))
    .where(inScope(track.libraryId, scope))
    .orderBy(desc(plays.plays), desc(plays.lastPlayedAt), asc(track.id))
    .limit(limit);
}

/** How many times this person has played each of `trackIds`, all time, for the counts on track rows. Tracks they never played are left out. */
export async function playCounts(scope: Scope, trackIds: number[]) {
  if (!trackIds.length) return new Map<number, number>();
  const rows = await db
    .select({ trackId: playEvent.trackId, plays: sql<number>`count(*)::int` })
    .from(playEvent)
    .innerJoin(track, eq(track.id, playEvent.trackId))
    .where(and(eq(playEvent.userId, scope.user.id), inArray(playEvent.trackId, trackIds), inScope(track.libraryId, scope)))
    .groupBy(playEvent.trackId);
  return new Map(rows.map((row) => [row.trackId, row.plays]));
}

/** Each artist with each album they are on: as its album artist, or credited on one of its tracks. */
const appearance = db
  .select({ artistId: trackArtist.artistId, albumId: track.albumId })
  .from(trackArtist)
  .innerJoin(track, eq(track.id, trackArtist.trackId))
  .union(db.select({ artistId: album.artistId, albumId: album.id }).from(album))
  .as("appearance");

/** A filter for `listAlbums`: every album an artist is on, not only the ones filed under them. */
export const albumsWith = (artistId: number) =>
  inArray(album.id, db.select({ albumId: appearance.albumId }).from(appearance).where(eq(appearance.artistId, artistId)));

/** A filter for `listTracks`: every track an artist is credited on, alone or with others. */
export const tracksWith = (artistId: number) =>
  inArray(track.id, db.select({ trackId: trackArtist.trackId }).from(trackArtist).where(eq(trackArtist.artistId, artistId)));

export type ArtistRow = Awaited<ReturnType<typeof listArtists>>[number];

/**
 * Everyone credited on something in scope, each with the number of albums
 * they are on. A joint credit counts for each of its artists.
 */
export async function listArtists(scope: Scope, options: Page & { where?: SQL; orderBy?: SQL[] } = {}) {
  return db
    .select({ id: artist.id, name: artist.name, albumCount: count(album.id), starredAt: annotation.starredAt })
    .from(artist)
    .innerJoin(appearance, eq(appearance.artistId, artist.id))
    .innerJoin(album, and(eq(album.id, appearance.albumId), inScope(album.libraryId, scope)))
    .leftJoin(annotation, annotationOf(scope, "artist", artist.id))
    .where(options.where)
    .groupBy(artist.id, annotation.starredAt)
    .orderBy(...(options.orderBy ?? [asc(sql`lower(${artist.name})`)]))
    .limit(options.limit ?? 10_000)
    .offset(options.offset ?? 0);
}

// --- Search ---

// Letters that are searched as their plain form, and "$" for the names that use it as an s.
const plainLetters = {
  a: "àáâãäåāăą",
  c: "çćč",
  d: "ďđ",
  e: "èéêëēėęě",
  g: "ğ",
  i: "ìíîïīįı",
  l: "ł",
  n: "ñńň",
  o: "òóôõöøōő",
  r: "ř",
  s: "śšş$",
  t: "ť",
  u: "ùúûüūůűų",
  y: "ýÿ",
  z: "žźż",
};
const foldFrom = Object.values(plainLetters).join("");
const foldTo = Object.entries(plainLetters)
  .map(([plain, accented]) => plain.repeat([...accented].length))
  .join("");
/** Punctuation that is ignored: translate() deletes characters that have nothing to map to. */
const ignored = `.,'’‘´\`"!?()[]{}:;/\\*_~&+#@<>|=^%-–—`;

/**
 * Text as search compares it: lowercase, accents and punctuation gone, single
 * spaces. So "rufus" finds RÜFÜS DU SOL, "amc" finds A.M.C and "asap" finds
 * A$AP Rocky. Both sides of every comparison go through it.
 */
const folded = (text: SQL | string) =>
  sql`btrim(regexp_replace(translate(lower(${text}), ${foldFrom + ignored}, ${foldTo}), '\\s+', ' ', 'g'))`;

/** Every word has to appear somewhere in `haystack`, which is already folded. */
const hasWords = (haystack: SQL, words: string[]) =>
  sql.join(
    words.map((word) => sql`strpos(${haystack}, ${folded(word)}) > 0`),
    sql` and `,
  );

/**
 * How well `field` answers the query, best first: it is the query (0), starts
 * with it (1), holds it as typed (2), holds every word (3), or the row matched
 * through another field (4).
 */
function relevance(field: SQL, words: string[]) {
  const name = folded(field);
  const phrase = folded(words.join(" "));
  return sql`case when ${name} = ${phrase} then 0 when starts_with(${name}, ${phrase}) then 1 when strpos(${name}, ${phrase}) > 0 then 2 when ${hasWords(name, words)} then 3 else 4 end`;
}

/**
 * Search across artists, albums and tracks. Every word has to match, but not
 * all in one field: tracks match on title, artist credit and album together,
 * so "daft around" finds Around the World, and a track is found by anyone
 * credited on it. Accents, case and punctuation are ignored. The closest
 * matches on the name or title come first (see `relevance`), then by name. An
 * empty query lists everything, which is how Subsonic apps sync a library.
 */
export async function search(
  scope: Scope,
  query: string,
  pages: { artists?: Page; albums?: Page; tracks?: Page } = {},
) {
  const words = query.trim().split(/\s+/).filter(Boolean);
  const matching = (haystack: SQL) => (words.length ? hasWords(folded(haystack), words) : undefined);
  const closestFirst = (field: SQL, ...then: SQL[]) => (words.length ? [asc(relevance(field, words)), ...then] : then);

  const [artists, albums, tracks] = await Promise.all([
    listArtists(scope, {
      where: matching(sql`${artist.name}`),
      orderBy: closestFirst(sql`${artist.name}`, asc(sql`lower(${artist.name})`)),
      limit: 20,
      ...pages.artists,
    }),
    listAlbums(scope, {
      where: matching(sql`${album.name} || ' ' || ${album.artistCredit}`),
      orderBy: closestFirst(sql`${album.name}`, asc(sql`lower(${album.name})`), asc(album.id)),
      limit: 20,
      ...pages.albums,
    }),
    listTracks(scope, {
      where: matching(sql`${track.title} || ' ' || ${track.artistCredit} || ' ' || ${album.name}`),
      orderBy: closestFirst(sql`${track.title}`, asc(sql`lower(${track.title})`), asc(track.id)),
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

/**
 * Whether a scope may choose a playlist's cover. A cover is how the playlist
 * looks, not what is in it, so its owner may change it even when the playlist
 * follows a folder on disk.
 */
export const canSetPlaylistCover = (scope: Scope, row: { ownerId: string }) => row.ownerId === scope.user.id || scope.isAdmin;

/** Whether a scope may choose who listens to a playlist or folder: its owner, even when it follows the disk, and admins. */
export const canShare = (scope: Scope, row: { ownerId: string }) => row.ownerId === scope.user.id || scope.isAdmin;

/** Joins the audience someone gave a folder or playlist a rule made, which is kept by the rule and the disk path. */
export const ruleItemAudienceOf = (kind: "folder" | "playlist", ruleId: AnyColumn, sourcePath: AnyColumn) =>
  and(eq(ruleItemAudience.ruleId, ruleId), eq(ruleItemAudience.kind, kind), eq(ruleItemAudience.sourcePath, sourcePath));

/**
 * Everything needed to say who can listen to anything in the playlist tree:
 * every folder's own setting and every rule's default, in two queries. Every
 * way in (the website, the app, Subsonic) asks the resolver this returns.
 * A rebuild passes its transaction to see its own changes.
 */
export async function loadAudiences(executor: Pick<Db, "select"> = db) {
  const [folders, rules] = await Promise.all([
    executor
      .select({
        id: playlistFolder.id,
        parentId: playlistFolder.parentId,
        ruleId: playlistFolder.ruleId,
        own: playlistFolder.audience,
        fromRule: ruleItemAudience.audience,
      })
      .from(playlistFolder)
      .leftJoin(ruleItemAudience, ruleItemAudienceOf("folder", playlistFolder.ruleId, playlistFolder.sourcePath)),
    executor.select({ id: folderRule.id, audience: folderRule.audience }).from(folderRule),
  ]);
  return audienceResolver({ folders: folders.map(({ own, fromRule, ...folder }) => ({ ...folder, audience: own ?? fromRule })), rules });
}

export type PlaylistRow = Awaited<ReturnType<typeof listPlaylists>>[number];

/**
 * Playlists a scope can see, with counts of the tracks it can actually play:
 * its own, all of them for admins, and ones whose audience includes it that
 * hold at least one track it can reach. A shared playlist of music you have
 * no access to stays hidden, so its name doesn't give away what a private
 * library holds. `audience` is who can listen, worked out up the folder tree;
 * `ownAudience` is the playlist's own setting, null when it follows its folder.
 * Pass `audiences` when the caller has already loaded them.
 */
export async function listPlaylists(scope: Scope, where?: SQL, audiences?: AudienceResolver) {
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

  const [rows, resolver] = await Promise.all([
    db
      .select({
        id: playlist.id,
        name: playlist.name,
        ownerId: playlist.ownerId,
        ownerName: sql<string>`coalesce(${user.username}, ${user.name})`,
        readOnly: playlist.readOnly,
        comment: playlist.comment,
        folderId: playlist.folderId,
        coverSeed: playlist.coverSeed,
        coverAlbumId: playlist.coverAlbumId,
        coverUpload: playlist.coverUpload,
        /** Changes whenever the cover would, so a page can ask for the new picture. */
        coverKey: sql<string>`concat_ws('-', ${playlist.coverSeed}, ${playlist.coverAlbumId}, ${playlist.coverUpload}, md5(${playlist.name}))`,
        /** When this person pinned it to the top of their list, if they have. */
        pinnedAt: playlistPin.pinnedAt,
        ruleId: playlist.ruleId,
        sourcePath: playlist.sourcePath,
        fromFolder: sql<boolean>`${playlist.ruleId} is not null`,
        createdAt: playlist.createdAt,
        updatedAt: playlist.updatedAt,
        trackCount: sql<number>`coalesce(${totals.trackCount}, 0)::int`,
        duration: sql<number>`coalesce(${totals.duration}, 0)::int`,
        own: playlist.audience,
        fromRule: ruleItemAudience.audience,
      })
      .from(playlist)
      .innerJoin(user, eq(user.id, playlist.ownerId))
      .leftJoin(totals, eq(totals.playlistId, playlist.id))
      .leftJoin(playlistPin, and(eq(playlistPin.playlistId, playlist.id), eq(playlistPin.userId, scope.user.id)))
      .leftJoin(ruleItemAudience, ruleItemAudienceOf("playlist", playlist.ruleId, playlist.sourcePath))
      .where(where)
      .orderBy(asc(sql`lower(${playlist.name})`)),
    audiences ?? loadAudiences(),
  ]);

  const viewer = { id: scope.user.id, isAdmin: scope.isAdmin };
  return rows.flatMap(({ own, fromRule, ...row }) => {
    const ownAudience = own ?? fromRule;
    const audience = resolver.playlist({ folderId: row.folderId, ruleId: row.ruleId, audience: ownAudience });
    if (canShare(scope, row)) return [{ ...row, audience, ownAudience }];
    if (!row.trackCount || !canListen(audience, row.ownerId, viewer)) return [];
    return [{ ...row, audience: seenBy(audience, scope.user.id), ownAudience: ownAudience && seenBy(ownAudience, scope.user.id) }];
  });
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
