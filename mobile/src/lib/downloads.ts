import { Directory, File, Paths } from "expo-file-system";
import { create } from "zustand";

import type { Track } from "./api";
import { arrivesAs, sealedRequest } from "./media";
import { isSealed } from "./sealed";
import { useServers, type Server } from "./servers";

// Playlists kept on the phone. Every track arrives sealed for this device
// (`sealed.ts`) and is stored exactly as it arrived, so what is on the phone's
// disk is never playable audio. It is opened only while it plays.

type Kept = {
  track: Track;
  /** The kind of audio inside, for naming the file it is opened into. */
  suffix: string;
  state: "waiting" | "arriving" | "kept" | "failed";
  bytes: number;
};
export type KeptPlaylist = { id: number; name: string; coverKey: string; trackIds: number[] };
type Shelf = { tracks: Record<number, Kept>; playlists: Record<number, KeptPlaylist> };

type Downloads = {
  /** What is kept, by server. */
  shelves: Record<string, Shelf>;
  ready: boolean;
  load: () => void;
  /** Keeps a playlist: its tracks are fetched, sealed, a couple at a time. Keeping it again picks up tracks added since. */
  keep: (server: Server, playlist: { id: number; name: string; coverKey: string; tracks: Track[] }) => void;
  /** Lets a playlist go, and every track no other kept playlist has. */
  release: (server: Server, playlistId: number) => void;
  /** Everything kept from a server, for when the phone is signed out of it. */
  releaseAll: (serverId: string) => void;
};

/** A folder name for a server, from its id. Not a secret, only something safe to name a folder with. */
const folderOf = (serverId: string) => {
  let hash = 5381;
  for (const char of serverId) hash = ((hash << 5) + hash + char.charCodeAt(0)) >>> 0;
  return hash.toString(16);
};
const shelfDirectory = (serverId: string) => new Directory(Paths.document, "sealed", folderOf(serverId));
/** The sealed file for a track, whether or not it has arrived. */
export const sealedFile = (serverId: string, trackId: number) => new File(shelfDirectory(serverId), `${trackId}.crt`);

const index = () => new File(Paths.document, "kept.json");
const write = (shelves: Downloads["shelves"]) => {
  const file = index();
  if (!file.exists) file.create();
  file.write(JSON.stringify(shelves));
};

/** Tracks fetched at once. */
const atOnce = 2;
let arriving = 0;

export const useDownloads = create<Downloads>()((set, get) => {
  /** Changes one track's entry, saves, and tells the screens. */
  const mark = (serverId: string, trackId: number, change: Partial<Kept>) => {
    const shelf = get().shelves[serverId];
    const kept = shelf?.tracks[trackId];
    if (!shelf || !kept) return;
    const shelves = { ...get().shelves, [serverId]: { ...shelf, tracks: { ...shelf.tracks, [trackId]: { ...kept, ...change } } } };
    set({ shelves });
    write(shelves);
  };

  /** Starts as many waiting tracks as there is room for. Runs again each time one finishes. */
  const pump = () => {
    for (const server of useServers.getState().servers) {
      for (const kept of Object.values(get().shelves[server.id]?.tracks ?? {})) {
        if (arriving >= atOnce) return;
        if (kept.state !== "waiting") continue;
        arriving++;
        mark(server.id, kept.track.id, { state: "arriving" });
        const { url, headers } = sealedRequest(server, kept.track);
        const file = sealedFile(server.id, kept.track.id);
        if (file.exists) file.delete();
        void File.downloadFileAsync(url, file, { headers })
          // The server answers a refusal with a few words, which would be saved like anything else.
          .then(() => mark(server.id, kept.track.id, isSealed(file) ? { state: "kept", bytes: file.size } : { state: "failed" }))
          .catch(() => mark(server.id, kept.track.id, { state: "failed" }))
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
    load: () => {
      const file = index();
      const shelves = file.exists ? (JSON.parse(file.textSync()) as Downloads["shelves"]) : {};
      // Anything that was on its way when the app closed starts again.
      for (const shelf of Object.values(shelves)) {
        for (const kept of Object.values(shelf.tracks)) if (kept.state === "arriving" || kept.state === "failed") kept.state = "waiting";
      }
      set({ shelves, ready: true });
      pump();
    },
    keep: (server, playlist) => {
      const shelf = get().shelves[server.id] ?? { tracks: {}, playlists: {} };
      const directory = shelfDirectory(server.id);
      if (!directory.exists) directory.create({ intermediates: true });
      const tracks = { ...shelf.tracks };
      for (const track of playlist.tracks) tracks[track.id] ??= { track, suffix: arrivesAs(track), state: "waiting", bytes: 0 };
      const playlists = { ...shelf.playlists, [playlist.id]: { id: playlist.id, name: playlist.name, coverKey: playlist.coverKey, trackIds: playlist.tracks.map((track) => track.id) } };
      const shelves = { ...get().shelves, [server.id]: { tracks, playlists } };
      set({ shelves });
      write(shelves);
      pump();
    },
    release: (server, playlistId) => {
      const shelf = get().shelves[server.id];
      if (!shelf) return;
      const { [playlistId]: _gone, ...playlists } = shelf.playlists;
      const stillWanted = new Set(Object.values(playlists).flatMap((playlist) => playlist.trackIds));
      const tracks: Shelf["tracks"] = {};
      for (const kept of Object.values(shelf.tracks)) {
        if (stillWanted.has(kept.track.id)) tracks[kept.track.id] = kept;
        else if (sealedFile(server.id, kept.track.id).exists) sealedFile(server.id, kept.track.id).delete();
      }
      const shelves = { ...get().shelves, [server.id]: { tracks, playlists } };
      set({ shelves });
      write(shelves);
    },
    releaseAll: (serverId) => {
      const directory = shelfDirectory(serverId);
      if (directory.exists) directory.delete();
      const { [serverId]: _gone, ...shelves } = get().shelves;
      set({ shelves });
      write(shelves);
    },
  };
});

/** How a kept playlist is getting on: how many of its tracks are on the phone, out of how many, and how big they are. */
export function progressOf(shelf: Shelf | undefined, playlistId: number) {
  const playlist = shelf?.playlists[playlistId];
  if (!shelf || !playlist) return null;
  const kept = playlist.trackIds.map((id) => shelf.tracks[id]).filter((entry) => entry !== undefined);
  return {
    total: playlist.trackIds.length,
    done: kept.filter((entry) => entry.state === "kept").length,
    failed: kept.filter((entry) => entry.state === "failed").length,
    bytes: kept.reduce((sum, entry) => sum + entry.bytes, 0),
  };
}
