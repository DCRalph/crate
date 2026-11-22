import type { Scope } from "~/server/access";
import type { AlbumRow, ArtistRow, PlaylistRow, TrackRow } from "~/server/library/queries";
import { SubsonicError } from "./respond";

// How rows look to Subsonic clients. Ids carry their type as a prefix, since
// clients pass the same `id` parameter for tracks, albums, artists and playlists.

const prefixes = { tr: "track", al: "album", ar: "artist", pl: "playlist" } as const;
export type IdType = (typeof prefixes)[keyof typeof prefixes];

/** "al-12" to { type: "album", id: 12 }. Anything else is "not found". */
export function parseId(value: string): { type: IdType; id: number } {
  const match = /^(tr|al|ar|pl)-(\d+)$/.exec(value);
  if (!match) throw new SubsonicError(70);
  return { type: prefixes[match[1] as keyof typeof prefixes], id: Number(match[2]) };
}

/** The numeric id from a prefixed id that must be of one type. */
export function idOf(value: string, type: IdType) {
  const parsed = parseId(value);
  if (parsed.type !== type) throw new SubsonicError(70);
  return parsed.id;
}

const iso = (date: Date | null) => date?.toISOString();

export const toSong = (row: TrackRow) => ({
  id: `tr-${row.id}`,
  parent: `al-${row.albumId}`,
  isDir: false,
  title: row.title,
  album: row.albumName,
  artist: row.artistName,
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
});

/** An album in the tag-based (ID3) calls. */
export const toAlbum = (row: AlbumRow) => ({
  id: `al-${row.id}`,
  name: row.name,
  artist: row.artistName,
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
  public: row.isPublic,
  songCount: row.trackCount,
  duration: row.duration,
  created: iso(row.createdAt),
  changed: iso(row.updatedAt),
  coverArt: `pl-${row.id}`,
  readonly: row.readOnly,
});

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
