import type { PlayRange } from "~/lib/most-played";
import type { Scope } from "~/server/access";
import type { AlbumRow, ArtistRow, MostPlayedRow, PlaylistRow, TrackRow } from "~/server/library/queries";
import { SubsonicError } from "./respond";

// How rows look to Subsonic clients. Ids carry their type as a prefix, since
// clients pass the same `id` parameter for tracks, albums, artists and playlists.

const prefixes = { tr: "track", al: "album", ar: "artist", pl: "playlist" } as const;
export type IdType = (typeof prefixes)[keyof typeof prefixes];

/** The largest id a row can have: ids are Postgres integers. */
const maxId = 2_147_483_647;

/** "al-12" to { type: "album", id: 12 }. Anything else, an id too big to be a row's included, is "not found". */
export function parseId(value: string): { type: IdType; id: number } {
  const match = /^(tr|al|ar|pl)-(\d+)$/.exec(value);
  const id = match ? Number(match[2]) : NaN;
  if (!match || !(id <= maxId)) throw new SubsonicError(70);
  return { type: prefixes[match[1] as keyof typeof prefixes], id };
}

/** The numeric id from a prefixed id that must be of one type. */
export function idOf(value: string, type: IdType) {
  const parsed = parseId(value);
  if (parsed.type !== type) throw new SubsonicError(70);
  return parsed.id;
}

const iso = (date: Date | null) => date?.toISOString();

/** OpenSubsonic's `replayGain` for a song, or undefined when the file has no ReplayGain tags. */
function toReplayGain({ trackGain, albumGain, trackPeak, albumPeak }: TrackRow) {
  const tags = { trackGain, albumGain, trackPeak, albumPeak };
  return Object.values(tags).some((value) => value !== null) ? tags : undefined;
}

/**
 * A song. `artist` is the whole credit as shown and `artistId` the first
 * artist on it, which is all an older client reads. OpenSubsonic clients get
 * everyone credited in `artists`.
 */
export const toSong = (row: TrackRow) => ({
  id: `tr-${row.id}`,
  parent: `al-${row.albumId}`,
  isDir: false,
  title: row.title,
  album: row.albumName,
  artist: row.artistName,
  displayArtist: row.artistName,
  artists: row.artists.map((credited) => ({ id: `ar-${credited.id}`, name: credited.name })),
  track: row.trackNumber,
  year: row.year,
  genre: row.genre,
  coverArt: `al-${row.albumId}`,
  size: row.size,
  contentType: row.contentType,
  suffix: row.suffix,
  duration: row.duration,
  bitRate: row.bitRate,
  path: row.relPath,
  discNumber: row.discNumber,
  created: iso(row.createdAt),
  albumId: `al-${row.albumId}`,
  artistId: `ar-${row.artistId}`,
  type: "music",
  isVideo: false,
  starred: iso(row.starredAt),
  userRating: row.rating,
  replayGain: toReplayGain(row),
});

/** An album in the tag-based (ID3) calls. `artist` is the album artist credit as shown, `artistId` the first artist on it. */
export const toAlbum = (row: AlbumRow) => ({
  id: `al-${row.id}`,
  name: row.name,
  artist: row.artistName,
  displayArtist: row.artistName,
  artistId: `ar-${row.artistId}`,
  coverArt: `al-${row.id}`,
  songCount: row.trackCount,
  duration: row.duration,
  created: iso(row.createdAt),
  year: row.year,
  genre: row.genre,
  starred: iso(row.starredAt),
  userRating: row.rating,
});

/** An album in the folder-based calls, where it is a directory under its artist. */
export const toAlbumFolder = (row: AlbumRow) => ({
  id: `al-${row.id}`,
  parent: `ar-${row.artistId}`,
  isDir: true,
  title: row.name,
  name: row.name,
  album: row.name,
  artist: row.artistName,
  year: row.year,
  genre: row.genre,
  coverArt: `al-${row.id}`,
  duration: row.duration,
  songCount: row.trackCount,
  created: iso(row.createdAt),
  starred: iso(row.starredAt),
  userRating: row.rating,
});

export const toArtist = (row: ArtistRow) => ({
  id: `ar-${row.id}`,
  name: row.name,
  coverArt: `ar-${row.id}`,
  albumCount: row.albumCount,
  starred: iso(row.starredAt),
});

export const toPlaylist = (row: PlaylistRow) => ({
  id: `pl-${row.id}`,
  name: row.name,
  comment: row.comment,
  owner: row.ownerName,
  // Subsonic only knows public or not: public is everyone on the server.
  public: row.audience.kind === "everyone",
  songCount: row.trackCount,
  duration: row.duration,
  created: iso(row.createdAt),
  changed: iso(row.updatedAt),
  coverArt: `pl-${row.id}`,
  readonly: row.readOnly,
});

/**
 * Most played, the playlist every caller gets made from their own plays over
 * the last 90 days. Real playlist ids are numbers, so its id never matches
 * one, and `parseId` refuses it: handlers check for it before parsing.
 */
export const mostPlayed = { id: "pl-most-played", range: "90d" } as const satisfies { id: string; range: PlayRange };

/**
 * Most played as a playlist: read only, the caller's own, with the cover of
 * its top track's album. It counts as changed when they last played anything
 * on it, so clients that cache playlists by `changed` fetch it again.
 */
export function toMostPlayedPlaylist(scope: Scope, tracks: Pick<MostPlayedRow, "albumId" | "duration" | "lastPlayedAt">[]) {
  const at = tracks.length ? new Date(Math.max(...tracks.map((row) => row.lastPlayedAt.getTime()))) : new Date();
  return {
    id: mostPlayed.id,
    name: "Most played",
    comment: "Your most played tracks over the last 90 days.",
    owner: scope.user.username,
    public: false,
    songCount: tracks.length,
    duration: tracks.reduce((sum, row) => sum + row.duration, 0),
    created: at.toISOString(),
    changed: at.toISOString(),
    coverArt: tracks[0] ? `al-${tracks[0].albumId}` : undefined,
    readonly: true,
  };
}

/** Subsonic's user record. Admin rights are never granted over this API. */
export const toUser = (scope: Scope) => ({
  username: scope.user.username,
  email: scope.user.email,
  scrobblingEnabled: true,
  maxBitRate: scope.maxBitRate ?? 0,
  adminRole: false,
  settingsRole: false,
  downloadRole: scope.downloadLibraryIds.size > 0,
  uploadRole: false,
  playlistRole: true,
  coverArtRole: false,
  commentRole: false,
  podcastRole: false,
  streamRole: true,
  jukeboxRole: false,
  shareRole: false,
  videoConversionRole: false,
  folder: scope.libraryIds,
});

const articles = /^(the|el|la|los|las|le|les)\s+/i;
export const ignoredArticles = "The El La Los Las Le Les";

/** Artists under the letter they are filed by, ignoring a leading article. */
export function toIndexes<T extends { name: string }>(artists: T[]) {
  const byLetter = new Map<string, T[]>();
  for (const row of artists) {
    const first = row.name.replace(articles, "").charAt(0).toUpperCase();
    const letter = /\p{L}/u.test(first) ? first : "#";
    byLetter.set(letter, [...(byLetter.get(letter) ?? []), row]);
  }
  return [...byLetter].sort(([a], [b]) => a.localeCompare(b)).map(([name, items]) => ({ name, artist: items }));
}
