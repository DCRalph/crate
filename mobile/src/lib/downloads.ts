import { Directory, File, Paths } from "expo-file-system";
import { downloadAsync, FileSystemSessionType } from "expo-file-system/legacy";
import { create } from "zustand";

import { clientFor, type Track } from "./api";
import { arrivesAs, sealedRequest } from "./media";
import { useNetwork } from "./network";
import { isSealed } from "./sealed";
import { useServers, type Server } from "./servers";
import { useSettings } from "./settings";

// Playlists downloaded to the phone. Every track arrives sealed for this
// device (`sealed.ts`) and is stored exactly as it arrived, so what is on the
// phone's disk is never playable audio. It is opened only while it plays.
//
// Several tracks arrive at once (Settings says how many), through the
// system's background transfers, so they carry on while the app is behind
// another or the screen is locked.

type Download = {
  track: Track;
  /** The kind of audio inside, for naming the file it is opened into. */
  suffix: string;
  state: "waiting" | "arriving" | "downloaded" | "failed";
  bytes: number;
};
export type DownloadedPlaylist = { id: number; name: string; coverKey: string; trackIds: number[] };
type Shelf = { tracks: Record<number, Download>; playlists: Record<number, DownloadedPlaylist> };

type Downloads = {
  /** What is downloaded, by server. */
  shelves: Record<string, Shelf>;
  ready: boolean;
  /** Downloads are waiting for Wi-Fi, because Settings says to use nothing else. */
  held: boolean;
  load: () => void;
  /**
   * Downloads a playlist: its tracks are fetched, sealed, a couple at a time.
   * Given a playlist that is already here, it makes the copy match: tracks
   * added since arrive, and ones taken out go.
   */
  download: (server: Server, playlist: { id: number; name: string; coverKey: string; tracks: Track[] }) => void;
  /** Removes a playlist from the phone, and every track no other downloaded playlist has. */
  remove: (server: Server, playlistId: number) => void;
  /** Removes everything downloaded from a server, for when the phone is signed out of it. */
  removeAll: (serverId: string) => void;
  /** Brings every downloaded playlist up to date with its server, when Settings asks for that and the connection is one downloads may use. */
  sync: () => Promise<void>;
};

/** A folder name for a server, from its id. Not a secret, only something safe to name a folder with. */
const folderOf = (serverId: string) => {
  let hash = 5381;
  for (const char of serverId) hash = ((hash << 5) + hash + char.charCodeAt(0)) >>> 0;
  return hash.toString(16);
};
const sealedDirectory = () => new Directory(Paths.document, "sealed");
const shelfDirectory = (serverId: string) => new Directory(sealedDirectory(), folderOf(serverId));
/** The sealed file for a track, whether or not it has arrived. */
export const sealedFile = (serverId: string, trackId: number) => new File(shelfDirectory(serverId), `${trackId}.crt`);

const index = () => new File(Paths.document, "downloads.json");
const write = (shelves: Downloads["shelves"]) => {
  const file = index();
  if (!file.exists) file.create();
  file.write(JSON.stringify(shelves));
};

/** Removes every sealed file the index doesn't know: what a version before this one left, or a server that is gone. */
function sweep(shelves: Downloads["shelves"]) {
  const root = sealedDirectory();
  if (!root.exists) return;
  const folders = new Map(Object.entries(shelves).map(([serverId, shelf]) => [folderOf(serverId), shelf]));
  for (const folder of root.list()) {
    const shelf = folders.get(folder.name);
    if (!(folder instanceof Directory) || !shelf) folder.delete();
    else for (const file of folder.list()) if (!shelf.tracks[Number.parseInt(file.name, 10)]) file.delete();
  }
}

/** The tracks some playlist in `playlists` still has. The files of the rest are deleted. */
function wanted(serverId: string, tracks: Shelf["tracks"], playlists: Shelf["playlists"]) {
  const ids = new Set(Object.values(playlists).flatMap((playlist) => playlist.trackIds));
  const kept: Shelf["tracks"] = {};
  for (const entry of Object.values(tracks)) {
    if (ids.has(entry.track.id)) kept[entry.track.id] = entry;
    else if (sealedFile(serverId, entry.track.id).exists) sealedFile(serverId, entry.track.id).delete();
  }
  return kept;
}

let arriving = 0;
const allowed = () => useSettings.getState().downloadOver === "any" || !useNetwork.getState().mobileData;

export const useDownloads = create<Downloads>()((set, get) => {
  /** Changes one track's entry, saves, and tells the screens. */
  const mark = (serverId: string, trackId: number, change: Partial<Download>) => {
    const shelf = get().shelves[serverId];
    const entry = shelf?.tracks[trackId];
    if (!shelf || !entry) return;
    const shelves = { ...get().shelves, [serverId]: { ...shelf, tracks: { ...shelf.tracks, [trackId]: { ...entry, ...change } } } };
    set({ shelves });
    write(shelves);
  };

  /** Starts as many waiting tracks as there is room for, on a connection downloads may use. Runs again each time one finishes. */
  const pump = () => {
    set({ held: !allowed() });
    if (!allowed()) return;
    const quality = useSettings.getState().downloadQuality;
    for (const server of useServers.getState().servers) {
      for (const entry of Object.values(get().shelves[server.id]?.tracks ?? {})) {
        if (arriving >= useSettings.getState().downloadsAtOnce) return;
        if (entry.state !== "waiting") continue;
        arriving++;
        // The quality may have changed since the track was queued, so what it arrives as is settled now.
        mark(server.id, entry.track.id, { state: "arriving", suffix: arrivesAs(entry.track, quality) });
        const { url, headers } = sealedRequest(server, entry.track, quality);
        const file = sealedFile(server.id, entry.track.id);
        if (file.exists) file.delete();
        // The older download call is the one that can hand the transfer to the system to carry on in the background.
        void downloadAsync(url, file.uri, { headers, sessionType: FileSystemSessionType.BACKGROUND })
          // The server answers a refusal with a few words, which would be saved like anything else.
          .then(() => mark(server.id, entry.track.id, isSealed(file) ? { state: "downloaded", bytes: file.size } : { state: "failed" }))
          .catch(() => mark(server.id, entry.track.id, { state: "failed" }))
          .finally(() => {
            arriving--;
            pump();
          });
      }
    }
  };

  return {
    shelves: {},
    ready: false,
    held: false,
    load: () => {
      const file = index();
      const shelves = file.exists ? (JSON.parse(file.textSync()) as Downloads["shelves"]) : {};
      // Anything that was on its way when the app closed starts again.
      for (const shelf of Object.values(shelves)) {
        for (const entry of Object.values(shelf.tracks)) if (entry.state === "arriving" || entry.state === "failed") entry.state = "waiting";
      }
      sweep(shelves);
      set({ shelves, ready: true });
      // The connection, and the rules in Settings about which to use and how many at once, decide whether more may start.
      useNetwork.subscribe(pump);
      useSettings.subscribe((now, before) => {
        if (now.downloadOver !== before.downloadOver || now.downloadsAtOnce !== before.downloadsAtOnce) pump();
      });
      // The servers are read from the keychain a moment after this; what was waiting starts once they are known.
      useServers.subscribe((now, before) => {
        if (now.servers !== before.servers) pump();
      });
      pump();
    },
    download: (server, playlist) => {
      const shelf = get().shelves[server.id] ?? { tracks: {}, playlists: {} };
      const directory = shelfDirectory(server.id);
      if (!directory.exists) directory.create({ intermediates: true });
      const tracks = { ...shelf.tracks };
      const quality = useSettings.getState().downloadQuality;
      for (const track of playlist.tracks) tracks[track.id] ??= { track, suffix: arrivesAs(track, quality), state: "waiting", bytes: 0 };
      const playlists = { ...shelf.playlists, [playlist.id]: { id: playlist.id, name: playlist.name, coverKey: playlist.coverKey, trackIds: playlist.tracks.map((track) => track.id) } };
      const shelves = { ...get().shelves, [server.id]: { tracks: wanted(server.id, tracks, playlists), playlists } };
      set({ shelves });
      write(shelves);
      pump();
    },
    remove: (server, playlistId) => {
      const shelf = get().shelves[server.id];
      if (!shelf) return;
      const { [playlistId]: _gone, ...playlists } = shelf.playlists;
      const shelves = { ...get().shelves, [server.id]: { tracks: wanted(server.id, shelf.tracks, playlists), playlists } };
      set({ shelves });
      write(shelves);
    },
    removeAll: (serverId) => {
      const directory = shelfDirectory(serverId);
      if (directory.exists) directory.delete();
      const { [serverId]: _gone, ...shelves } = get().shelves;
      set({ shelves });
      write(shelves);
    },
    sync: async () => {
      if (!useSettings.getState().syncDownloads || !allowed()) return;
      for (const server of useServers.getState().servers) {
        for (const { id } of Object.values(get().shelves[server.id]?.playlists ?? {})) {
          const fresh = await clientFor(server)
            .playlists.byId.query({ id })
            .catch(() => null);
          // Unreachable, or gone from the server: the copy here stays as it is. So does one removed here while the server was answering.
          if (fresh && get().shelves[server.id]?.playlists[id]) get().download(server, { id, name: fresh.name, coverKey: fresh.coverKey, tracks: fresh.tracks });
        }
      }
    },
  };
});

/** How a downloaded playlist is getting on: how many of its tracks are on the phone, out of how many, and how big they are. */
export function progressOf(shelf: Shelf | undefined, playlistId: number) {
  const playlist = shelf?.playlists[playlistId];
  if (!shelf || !playlist) return null;
  const entries = playlist.trackIds.map((id) => shelf.tracks[id]).filter((entry) => entry !== undefined);
  return {
    total: playlist.trackIds.length,
    done: entries.filter((entry) => entry.state === "downloaded").length,
    failed: entries.filter((entry) => entry.state === "failed").length,
    bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
  };
}
