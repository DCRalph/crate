import "server-only";
import { and, asc, between, desc, eq, inArray, isNotNull, sql, type SQL } from "drizzle-orm";

import { inScope, type Scope } from "~/server/access";
import { db } from "~/server/db";
import { album, annotation, artist, library, track } from "~/server/db/app-schema";
import { coverFile } from "~/server/library/cover";
import { readPlayQueue, savePlayQueue } from "~/server/library/play-queue";
import {
  albumsWith,
  annotate,
  findTrackFile,
  getPlaylist,
  listAlbums,
  listAlbumsByPlays,
  listArtists,
  listGenres,
  listPlaylists,
  listStarred,
  listTracks,
  search,
} from "~/server/library/queries";
import { scanProgress } from "~/server/library/scanner";
import { recordPlay } from "~/server/logs";
import { fileResponse, transcodeResponse } from "~/server/media/stream";
import { decideStream } from "~/server/media/transcode";
import { namedByFolder, withoutFolderName } from "~/server/playlists/folders";
import { createPlaylist, deletePlaylist, PlaylistError, updatePlaylist } from "~/server/playlists/mutations";
import { SubsonicError, type Payload } from "./respond";
import {
  idOf,
  ignoredArticles,
  parseId,
  toAlbum,
  toAlbumFolder,
  toArtist,
  toIndexes,
  toPlaylist,
  toSong,
  toUser,
} from "./shapes";

/** Request parameters with Subsonic's conventions: repeated keys are lists, missing required ones are error 10. */
export class Params {
  constructor(private values: URLSearchParams) {}
  get = (name: string) => this.values.get(name) ?? undefined;
  all = (name: string) => this.values.getAll(name);
  required(name: string) {
    const value = this.values.get(name);
    if (value === null || value === "") throw new SubsonicError(10, `Required parameter is missing: ${name}`);
    return value;
  }
  int(name: string) {
    const value = Number(this.values.get(name) ?? NaN);
    return Number.isFinite(value) ? Math.trunc(value) : undefined;
  }
  /** A count or offset: never negative, never above `max`. */
  page(name: string, fallback: number, max = 500) {
    return Math.min(Math.max(this.int(name) ?? fallback, 0), max);
  }
  bool = (name: string) => this.values.get(name) === "true";
}

export type Context = {
  scope: Scope;
  params: Params;
  request: Request;
  /** The client's own name (`c`). */
  client: string | null;
  ip: string | null;
  /** Set by media handlers so the access log can name the track. */
  log: { trackId?: number };
};

type Handler = (ctx: Context) => Promise<Payload | Response>;

/** What each user's clients last reported playing. In memory: it only matters for a few minutes. */
const nowPlaying = new Map<string, { userId: string; username: string; client: string | null; trackId: number; at: number }>();

function noteNowPlaying(ctx: Context, trackId: number) {
  const { user } = ctx.scope;
  nowPlaying.set(`${user.id}\0${ctx.client}`, { userId: user.id, username: user.username, client: ctx.client, trackId, at: Date.now() });
}

/** Maps playlist write failures onto Subsonic's errors. */
async function playlistWrite<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof PlaylistError) throw new SubsonicError(error.reason === "not_found" ? 70 : 50, error.message);
    throw error;
  }
}

async function playlistPayload(ctx: Context, id: number) {
  const found = await getPlaylist(ctx.scope, id);
  if (!found) throw new SubsonicError(70, "Playlist not found.");
  const [named] = await namedByFolder([found]);
  return { playlist: { ...toPlaylist(named!), entry: found.tracks.map(toSong) } };
}

/** `musicFolderId` narrows a list to one library. Scope is applied on top, so it can't widen anything. */
const inFolder = (ctx: Context, column: typeof album.libraryId | typeof track.libraryId) => {
  const id = ctx.params.int("musicFolderId");
  return id === undefined ? undefined : eq(column, id);
};

async function albumList(ctx: Context) {
  const { params, scope } = ctx;
  const type = params.required("type");
  const page = { limit: params.page("size", 10), offset: params.page("offset", 0, 1_000_000) };
  if (type === "recent" || type === "frequent") return listAlbumsByPlays(scope, type, page);

  const byName = asc(sql`lower(${album.name})`);
  let where: SQL | undefined;
  let orderBy: SQL[];
  switch (type) {
    case "random":
      orderBy = [sql`random()`];
      break;
    case "newest":
      orderBy = [desc(album.createdAt), desc(album.id)];
      break;
    case "alphabeticalByName":
      orderBy = [byName];
      break;
    case "alphabeticalByArtist":
      orderBy = [asc(sql`lower(${album.artistCredit})`), byName];
      break;
    case "starred":
      where = isNotNull(annotation.starredAt);
      orderBy = [desc(annotation.starredAt)];
      break;
    case "highest":
      where = isNotNull(annotation.rating);
      orderBy = [desc(annotation.rating), byName];
      break;
    case "byGenre":
      where = eq(album.genre, params.required("genre"));
      orderBy = [byName];
      break;
    case "byYear": {
      const from = Number(params.required("fromYear"));
      const to = Number(params.required("toYear"));
      where = between(album.year, Math.min(from, to), Math.max(from, to));
      orderBy = [from <= to ? asc(album.year) : desc(album.year), byName];
      break;
    }
    default:
      throw new SubsonicError(0, `Unknown list type: ${type}`);
  }
  return listAlbums(scope, { where: and(where, inFolder(ctx, album.libraryId)), orderBy, ...page });
}

async function searchPayload(ctx: Context) {
  const { params } = ctx;
  // Clients send "" (with the quotes) to mean "everything", to sync a whole library.
  const query = params.get("query")?.replace(/^"+|"+$/g, "") ?? "";
  const page = (name: string) => ({
    limit: params.page(`${name}Count`, 20, 5000),
    offset: params.page(`${name}Offset`, 0, 10_000_000),
  });
  return search(ctx.scope, query, { artists: page("artist"), albums: page("album"), tracks: page("song") });
}

/** star, unstar: ids can come as `id` (any type), `albumId` or `artistId`, each repeated. */
async function setStars(ctx: Context, starred: boolean) {
  const { params, scope } = ctx;
  const targets = [
    ...params.all("id").map(parseId),
    ...params.all("albumId").map((value) => ({ type: "album" as const, id: idOf(value, "album") })),
    ...params.all("artistId").map((value) => ({ type: "artist" as const, id: idOf(value, "artist") })),
  ];
  for (const target of targets) {
    if (target.type === "playlist") continue;
    await annotate(scope.user.id, target.type, target.id, { starred });
  }
  return {};
}

async function sendTrack(ctx: Context, mode: "stream" | "download") {
  const { params, scope, request } = ctx;
  const id = idOf(params.required("id"), "track");
  const file = await findTrackFile(scope, id);
  if (!file) throw new SubsonicError(70, "Song not found.");
  ctx.log.trackId = id;

  if (mode === "download") {
    if (!scope.downloadLibraryIds.has(file.libraryId)) throw new SubsonicError(50, "Downloads are turned off for this library.");
    return fileResponse(request, file.path, file.contentType, { downloadName: `${file.artistName} - ${file.title}.${file.suffix}` });
  }

  noteNowPlaying(ctx, id);
  const decision = decideStream(file, { format: params.get("format"), maxBitRate: params.int("maxBitRate") }, scope.maxBitRate);
  if (!decision.transcode) return fileResponse(request, file.path, file.contentType);
  return transcodeResponse(request, file.path, { ...decision, offsetSeconds: params.int("timeOffset") });
}

const empty = (key: string) => async () => ({ [key]: {} });

/**
 * Every Subsonic method the server answers, by name. Handlers return the
 * payload that goes inside `subsonic-response`, or a whole Response for media.
 */
export const handlers: Record<string, Handler> = {
  ping: async () => ({}),
  getLicense: async () => ({ license: { valid: true } }),
  tokenInfo: async ({ scope }) => ({ tokenInfo: { username: scope.user.username } }),

  getUser: async ({ scope, params }) => {
    // People can look themselves up; nobody can list others over this API.
    const username = params.get("username");
    if (username && username.toLowerCase() !== scope.user.username) throw new SubsonicError(50);
    return { user: toUser(scope) };
  },

  getMusicFolders: async ({ scope }) => {
    const rows = scope.libraryIds.length
      ? await db.select({ id: library.id, name: library.name }).from(library).where(inArray(library.id, scope.libraryIds)).orderBy(library.name)
      : [];
    return { musicFolders: { musicFolder: rows } };
  },

  getArtists: async (ctx) => {
    const artists = await listArtists(ctx.scope, { where: inFolder(ctx, album.libraryId) });
    return { artists: { ignoredArticles, index: toIndexes(artists.map(toArtist)) } };
  },
  getIndexes: async (ctx) => {
    const artists = await listArtists(ctx.scope, { where: inFolder(ctx, album.libraryId) });
    return { indexes: { ignoredArticles, lastModified: Date.now(), index: toIndexes(artists.map(toArtist)) } };
  },

  getArtist: async ({ scope, params }) => {
    const id = idOf(params.required("id"), "artist");
    const [found] = await listArtists(scope, { where: eq(artist.id, id) });
    if (!found) throw new SubsonicError(70, "Artist not found.");
    // Every album the artist is on, so someone only ever credited beside others still has albums.
    const albums = await listAlbums(scope, { where: albumsWith(id), orderBy: [asc(album.year), asc(album.name)], limit: 2000 });
    return { artist: { ...toArtist(found), album: albums.map(toAlbum) } };
  },

  getAlbum: async ({ scope, params }) => {
    const id = idOf(params.required("id"), "album");
    const [found] = await listAlbums(scope, { where: eq(album.id, id) });
    if (!found) throw new SubsonicError(70, "Album not found.");
    const songs = await listTracks(scope, { where: eq(track.albumId, id), limit: 5000 });
    return { album: { ...toAlbum(found), song: songs.map(toSong) } };
  },

  getSong: async ({ scope, params }) => {
    const [found] = await listTracks(scope, { where: eq(track.id, idOf(params.required("id"), "track")) });
    if (!found) throw new SubsonicError(70, "Song not found.");
    return { song: toSong(found) };
  },

  // Folder browsing is laid out from tags: artists hold albums, albums hold songs.
  getMusicDirectory: async ({ scope, params }) => {
    const target = parseId(params.required("id"));
    if (target.type === "artist") {
      const [found] = await listArtists(scope, { where: eq(artist.id, target.id) });
      if (!found) throw new SubsonicError(70, "Folder not found.");
      const albums = await listAlbums(scope, { where: albumsWith(target.id), orderBy: [asc(album.year), asc(album.name)], limit: 2000 });
      return { directory: { id: `ar-${found.id}`, name: found.name, child: albums.map(toAlbumFolder) } };
    }
    if (target.type === "album") {
      const [found] = await listAlbums(scope, { where: eq(album.id, target.id) });
      if (!found) throw new SubsonicError(70, "Folder not found.");
      const songs = await listTracks(scope, { where: eq(track.albumId, target.id), limit: 5000 });
      return { directory: { id: `al-${found.id}`, parent: `ar-${found.artistId}`, name: found.name, child: songs.map(toSong) } };
    }
    throw new SubsonicError(70, "Folder not found.");
  },

  getGenres: async ({ scope }) => ({
    genres: { genre: (await listGenres(scope)).map((row) => ({ value: row.name, songCount: row.trackCount, albumCount: row.albumCount })) },
  }),

  getAlbumList: async (ctx) => ({ albumList: { album: (await albumList(ctx)).map(toAlbumFolder) } }),
  getAlbumList2: async (ctx) => ({ albumList2: { album: (await albumList(ctx)).map(toAlbum) } }),

  getRandomSongs: async (ctx) => {
    const { params } = ctx;
    const genre = params.get("genre");
    const from = params.int("fromYear");
    const to = params.int("toYear");
    const songs = await listTracks(ctx.scope, {
      where: and(
        genre ? eq(track.genre, genre) : undefined,
        from === undefined ? undefined : sql`${track.year} >= ${from}`,
        to === undefined ? undefined : sql`${track.year} <= ${to}`,
        inFolder(ctx, track.libraryId),
      ),
      orderBy: [sql`random()`],
      limit: params.page("size", 10),
    });
    return { randomSongs: { song: songs.map(toSong) } };
  },

  getSongsByGenre: async (ctx) => {
    const songs = await listTracks(ctx.scope, {
      where: and(eq(track.genre, ctx.params.required("genre")), inFolder(ctx, track.libraryId)),
      orderBy: [asc(sql`lower(${track.title})`), asc(track.id)],
      limit: ctx.params.page("count", 10),
      offset: ctx.params.page("offset", 0, 10_000_000),
    });
    return { songsByGenre: { song: songs.map(toSong) } };
  },

  getStarred: async (ctx) => {
    const { artists, albums, tracks } = await listStarred(ctx.scope);
    return { starred: { artist: artists.map(toArtist), album: albums.map(toAlbumFolder), song: tracks.map(toSong) } };
  },
  getStarred2: async (ctx) => {
    const { artists, albums, tracks } = await listStarred(ctx.scope);
    return { starred2: { artist: artists.map(toArtist), album: albums.map(toAlbum), song: tracks.map(toSong) } };
  },

  search2: async (ctx) => {
    const { artists, albums, tracks } = await searchPayload(ctx);
    return { searchResult2: { artist: artists.map(toArtist), album: albums.map(toAlbumFolder), song: tracks.map(toSong) } };
  },
  search3: async (ctx) => {
    const { artists, albums, tracks } = await searchPayload(ctx);
    return { searchResult3: { artist: artists.map(toArtist), album: albums.map(toAlbum), song: tracks.map(toSong) } };
  },

  getNowPlaying: async ({ scope }) => {
    const cutoff = Date.now() - 10 * 60_000;
    for (const [key, entry] of nowPlaying) if (entry.at < cutoff) nowPlaying.delete(key);
    const entries = [...nowPlaying.values()];
    if (!entries.length) return { nowPlaying: {} };
    // Listed through the caller's scope, so nobody sees a track they can't reach.
    const songs = new Map(
      (await listTracks(scope, { where: inArray(track.id, entries.map((entry) => entry.trackId)) })).map((row) => [row.id, row]),
    );
    return {
      nowPlaying: {
        entry: entries.flatMap((entry) => {
          const song = songs.get(entry.trackId);
          if (!song) return [];
          return { ...toSong(song), username: entry.username, playerName: entry.client, minutesAgo: Math.floor((Date.now() - entry.at) / 60_000) };
        }),
      },
    };
  },

  // Subsonic has no playlist folders, so a playlist's folders ride along in its name.
  getPlaylists: async ({ scope }) => ({ playlists: { playlist: (await namedByFolder(await listPlaylists(scope))).map(toPlaylist) } }),
  getPlaylist: async (ctx) => playlistPayload(ctx, idOf(ctx.params.required("id"), "playlist")),

  createPlaylist: async (ctx) => {
    const { params, scope } = ctx;
    const trackIds = params.all("songId").map((value) => idOf(value, "track"));
    const existing = params.get("playlistId");
    // With a playlistId this replaces that playlist's songs; otherwise it makes a new one.
    const id = await playlistWrite(async () => {
      if (!existing) return createPlaylist(scope, { name: params.required("name"), trackIds });
      const playlistId = idOf(existing, "playlist");
      await updatePlaylist(scope, playlistId, { name: params.get("name"), trackIds });
      return playlistId;
    });
    return playlistPayload(ctx, id);
  },

  updatePlaylist: async ({ scope, params }) => {
    const isPublic = params.get("public");
    const playlistId = idOf(params.required("playlistId"), "playlist");
    const name = params.get("name");
    await playlistWrite(async () =>
      updatePlaylist(scope, playlistId, {
        // A client that renames usually sends back the name it was given, folders included.
        name: name === undefined ? undefined : await withoutFolderName(playlistId, name),
        comment: params.get("comment"),
        isPublic: isPublic === undefined ? undefined : isPublic === "true",
        addTrackIds: params.all("songIdToAdd").map((value) => idOf(value, "track")),
        removeIndexes: params.all("songIndexToRemove").map(Number).filter(Number.isInteger),
      }),
    );
    return {};
  },

  deletePlaylist: async ({ scope, params }) => {
    await playlistWrite(() => deletePlaylist(scope, idOf(params.required("id"), "playlist")));
    return {};
  },

  stream: (ctx) => sendTrack(ctx, "stream"),
  download: (ctx) => sendTrack(ctx, "download"),

  getCoverArt: async ({ scope, params, request }) => {
    const size = params.int("size") ?? null;
    const file = await coverFile(parseId(params.required("id")), size, scope);
    if (!file) throw new SubsonicError(70, "No cover art.", 404);
    return fileResponse(request, file, "image/jpeg", { cacheControl: "private, max-age=86400" });
  },

  star: (ctx) => setStars(ctx, true),
  unstar: (ctx) => setStars(ctx, false),

  setRating: async ({ scope, params }) => {
    const target = parseId(params.required("id"));
    const rating = Number(params.required("rating"));
    if (!Number.isInteger(rating) || rating < 0 || rating > 5) throw new SubsonicError(0, "Rating must be 0 to 5.");
    if (target.type !== "playlist") await annotate(scope.user.id, target.type, target.id, { rating });
    return {};
  },

  scrobble: async (ctx) => {
    const { scope, params } = ctx;
    const ids = params.all("id").map((value) => idOf(value, "track"));
    const times = params.all("time").map(Number);
    // submission=false is "now playing", not a finished play.
    if (params.get("submission") === "false") {
      if (ids[0] !== undefined) noteNowPlaying(ctx, ids[0]);
      return {};
    }
    const songs = new Map((await listTracks(scope, { where: inArray(track.id, ids.length ? ids : [0]) })).map((row) => [row.id, row]));
    for (const [index, id] of ids.entries()) {
      const song = songs.get(id);
      if (!song) continue;
      const time = times[index];
      await recordPlay({
        at: time && Number.isFinite(time) ? new Date(time) : new Date(),
        userId: scope.user.id,
        username: scope.user.username,
        trackId: id,
        title: song.title,
        artistName: song.artistName,
        client: ctx.client,
        ip: ctx.ip,
      });
    }
    return {};
  },

  getPlayQueue: async ({ scope }) => {
    const queue = await readPlayQueue(scope);
    if (!queue) return {};
    return {
      playQueue: {
        current: queue.currentId ? `tr-${queue.currentId}` : undefined,
        position: queue.positionMs,
        username: scope.user.username,
        changed: queue.changedAt.toISOString(),
        changedBy: queue.changedBy,
        entry: queue.tracks.map(toSong),
      },
    };
  },

  savePlayQueue: async ({ scope, params, client }) => {
    const current = params.get("current");
    await savePlayQueue(
      scope,
      { trackIds: params.all("id").map((value) => idOf(value, "track")), currentId: current ? idOf(current, "track") : null, positionMs: params.int("position") ?? 0 },
      client,
    );
    return {};
  },

  getScanStatus: async ({ scope }) => {
    const progress = scanProgress();
    const [total] = await db.select({ count: sql<number>`count(*)::int` }).from(track).where(inScope(track.libraryId, scope));
    return { scanStatus: { scanning: !!progress, count: total?.count ?? 0 } };
  },

  // Asked for by most clients on every screen. Answered empty rather than
  // "not implemented", which some clients treat as a broken server.
  getArtistInfo: empty("artistInfo"),
  getArtistInfo2: empty("artistInfo2"),
  getAlbumInfo: empty("albumInfo"),
  getAlbumInfo2: empty("albumInfo"),
  getSimilarSongs: empty("similarSongs"),
  getSimilarSongs2: empty("similarSongs2"),
  getTopSongs: empty("topSongs"),
  getLyrics: empty("lyrics"),
  getLyricsBySongId: empty("lyricsList"),
  getBookmarks: empty("bookmarks"),
  getShares: empty("shares"),
  getPodcasts: empty("podcasts"),
  getNewestPodcasts: empty("newestPodcasts"),
  getInternetRadioStations: empty("internetRadioStations"),
  getVideos: empty("videos"),
};

/** Extensions to the Subsonic API this server supports. Answered without signing in, as the spec requires. */
export const openSubsonicExtensions = [
  { name: "formPost", versions: [1] },
  { name: "apiKeyAuthentication", versions: [1] },
  { name: "transcodeOffset", versions: [1] },
];

