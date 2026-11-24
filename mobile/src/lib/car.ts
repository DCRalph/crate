import { NativeModule, requireOptionalNativeModule } from "expo";

import { clientFor, type Album, type Track } from "./api";
import { useDownloads } from "./downloads";
import { count, formatDuration } from "./format";
import { coverSource } from "./media";
import { usePlayer } from "./player";
import { activeServer, type Server } from "./servers";

// Crate in CarPlay: the system's lists, filled from here, and the system's
// Now playing, which follows the lock screen. The native side is
// `modules/car`; it only shows in a build made with `CARPLAY=1`.

type CarItem = { id: string; title: string; detail?: string; image?: { uri: string; headers: Record<string, string> }; browse?: boolean; playing?: boolean };
type CarSection = { title?: string; items: CarItem[] };
/** The lists the car asks for: its four tabs, Up Next, and what a row opens. */
type List = "home" | "playlists" | "albums" | "downloads" | "queue" | `album:${number}` | `playlist:${number}`;

declare class Car extends NativeModule<{ onLoad: (event: { request: number; list: List }) => void; onPick: (event: { list: List; item: string }) => void }> {
  fill(request: number, sections: CarSection[], empty: string | null): void;
}

const native = requireOptionalNativeModule<Car>("Car");

/** Cover size for a row. A car draws them small. */
const coverSize = 200;

const albumRow = (server: Server, album: Album): CarItem => ({
  id: `album:${album.id}`,
  title: album.name,
  detail: album.artistName,
  image: coverSource(server, "album", album.id, coverSize),
  browse: true,
});

const playlistRow = (server: Server, playlist: { id: number; name: string; coverKey: string }, detail: string): CarItem => ({
  id: `playlist:${playlist.id}`,
  title: playlist.name,
  detail,
  image: coverSource(server, "playlist", playlist.id, coverSize, playlist.coverKey),
  browse: true,
});

/** The tracks a list of them last showed, so that choosing one plays the list as it was seen. */
const shown = new Map<List, Track[]>();

/** A list of tracks; choosing one plays from it. `from` is the player's name for where it was played from. */
function trackRows(list: List, items: Track[], cover?: (track: Track) => CarItem["image"]): CarSection[] {
  shown.set(list, items);
  const { queue, index, from } = usePlayer.getState();
  const current = queue[index];
  return [
    {
      items: items.map((track, at) => ({
        id: String(at),
        title: track.title,
        detail: `${track.artistName} · ${formatDuration(track.duration)}`,
        image: cover?.(track),
        playing: list === "queue" ? at === index : from === list && track.id === current?.id,
      })),
    },
  ];
}

/** The downloaded copy of a playlist, for when the server can't be reached. */
function downloadedTracks(server: Server, id: number) {
  const shelf = useDownloads.getState().shelves[server.id];
  const playlist = shelf?.playlists[id];
  return playlist?.trackIds.flatMap((trackId) => shelf?.tracks[trackId]?.track ?? []);
}

/** The rows of one list, or the line to show in its place. */
async function rowsOf(server: Server, list: List): Promise<CarSection[]> {
  const api = clientFor(server);
  if (list === "home") {
    const home = await api.library.home.query();
    return [
      { title: "Recently played", items: home.recent.map((album) => albumRow(server, album)) },
      { title: "Newly added", items: home.added.map((album) => albumRow(server, album)) },
      { title: "Most played", items: home.frequent.map((album) => albumRow(server, album)) },
    ];
  }
  if (list === "playlists") {
    const tree = await api.playlists.tree.query();
    return [{ items: tree.playlists.map((playlist) => playlistRow(server, playlist, count(playlist.trackCount, "track"))) }];
  }
  if (list === "albums") {
    const page = await api.library.albums.query({ sort: "name", limit: 120 });
    return [{ items: page.items.map((album) => albumRow(server, album)) }];
  }
  if (list === "downloads") {
    const playlists = Object.values(useDownloads.getState().shelves[server.id]?.playlists ?? {});
    return [{ items: playlists.map((playlist) => playlistRow(server, playlist, count(playlist.trackIds.length, "track"))) }];
  }
  if (list === "queue") {
    return trackRows(list, usePlayer.getState().queue, (track) => coverSource(server, "album", track.albumId, coverSize));
  }
  const [kind, raw] = list.split(":");
  const id = Number(raw);
  if (kind === "album") return trackRows(list, (await api.library.album.query({ id })).tracks);
  const playlist = await api.playlists.byId.query({ id }).catch((failure: unknown) => {
    // Offline in a car is the usual case for a downloaded playlist.
    const downloaded = downloadedTracks(server, id);
    if (downloaded) return { tracks: downloaded };
    throw failure;
  });
  return trackRows(list, playlist.tracks);
}

/** Answers the car's lists and plays what is chosen in them. Call once, at launch. */
export function watchCar() {
  if (!native) return;

  native.addListener("onLoad", ({ request, list }) => {
    const server = activeServer();
    if (!server) return native.fill(request, [], "Add a server in Crate on your phone.");
    rowsOf(server, list).then(
      (sections) => native.fill(request, sections, list === "downloads" ? "Nothing downloaded. Download a playlist on your phone." : null),
      () => native.fill(request, [], "Can't reach the server."),
    );
  });

  native.addListener("onPick", ({ list, item }) => {
    const at = Number(item);
    const player = usePlayer.getState();
    if (list === "queue") return player.jump(at);
    const server = activeServer();
    const items = shown.get(list);
    if (server && items) player.play(server, items, at, list);
  });
}
