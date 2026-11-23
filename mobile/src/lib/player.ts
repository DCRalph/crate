import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioSource } from "expo-audio";
import { Directory, File, Paths } from "expo-file-system";
import { create } from "zustand";

import { clientFor, type Track } from "./api";
import { sealedFile, useDownloads } from "./downloads";
import { arrivesAs, sealedRequest, streamUrl } from "./media";
import { openSealed } from "./sealed";
import { authHeaders, useServers, type Server } from "./servers";
import { useSettings } from "./settings";

type Player = {
  /** What plays, in order, and the server it is from. */
  queue: Track[];
  index: number;
  serverId: string | null;
  /** Where the queue was played from ("album:12"), so that page's Play key knows it is the one playing. */
  from: string | null;
  playing: boolean;
  /** A track has been asked for and its sound hasn't started: arriving, being opened, or buffering. */
  loading: boolean;
  /** Seconds. */
  position: number;
  duration: number;
  play: (server: Server, tracks: Track[], startAt?: number, from?: string) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  jump: (index: number) => void;
  seek: (seconds: number) => void;
  /** Stops and empties the queue, for when the phone leaves the server it came from. */
  stop: () => void;
};

/** A play counts once the listener is this far in: half the track, or four minutes. */
const playedAfter = (duration: number) => Math.min(duration / 2, 240);
/** Previous goes back a track only this early in one. Later than that it starts the track over. */
const restartAfter = 3;

let engine: AudioPlayer | null = null;
/** Counts loads, so a track that takes a while to arrive can't start over one chosen after it. */
let loads = 0;
let counted = false;

/** Where tracks are opened into to be played. Emptied of everything but what is playing as the queue moves on. */
const openDirectory = () => new Directory(Paths.cache, "playing");
/** The track as it is on the phone, if it has been downloaded. */
const downloadOf = (serverId: string, track: Track) => {
  const entry = useDownloads.getState().shelves[serverId]?.tracks[track.id];
  return entry?.state === "downloaded" ? entry : null;
};
/** The file a track is opened into. Named for the kind of audio inside: what it was downloaded as, or what it streams as now. */
const openFile = (serverId: string, track: Track) =>
  new File(openDirectory(), `${serverId.replace(/\W/g, "").slice(-12)}-${track.id}.${downloadOf(serverId, track)?.suffix ?? arrivesAs(track, useSettings.getState().streamQuality)}`);

/**
 * What the audio player is given for a track. A downloaded track is opened
 * from its sealed file. A streamed one is fetched sealed and opened the same
 * way when streams are encrypted, which is the default; otherwise it plays
 * straight from the server as it arrives. An opened file only exists while
 * it plays.
 */
async function sourceFor(server: Server, track: Track): Promise<AudioSource> {
  const downloaded = downloadOf(server.id, track);
  const { sealStreams, streamQuality } = useSettings.getState();
  if (!downloaded && !sealStreams) return { uri: streamUrl(server, track, streamQuality), headers: authHeaders(server) };

  const directory = openDirectory();
  if (!directory.exists) directory.create({ intermediates: true });
  const out = openFile(server.id, track);
  if (out.exists) return { uri: out.uri };
  if (downloaded) {
    await openSealed(sealedFile(server.id, track.id), out, server.sealKey);
    return { uri: out.uri };
  }
  const { url, headers } = sealedRequest(server, track, streamQuality);
  const arrived = new File(directory, `${track.id}.arriving`);
  if (arrived.exists) arrived.delete();
  await File.downloadFileAsync(url, arrived, { headers });
  try {
    await openSealed(arrived, out, server.sealKey);
  } finally {
    arrived.delete();
  }
  return { uri: out.uri };
}

/** Removes every opened file but the ones named. */
function tidy(keep: File[]) {
  const directory = openDirectory();
  if (!directory.exists) return;
  const names = new Set(keep.map((file) => file.name));
  for (const item of directory.list()) if (item instanceof File && !names.has(item.name) && !item.name.endsWith(".arriving")) item.delete();
}

/**
 * The play queue and what is sounding. One audio player lives behind it,
 * made the first time something is played. It carries on with the screen
 * locked and puts the track on the lock screen.
 */
export const usePlayer = create<Player>()((set, get) => {
  const serverOf = () => useServers.getState().servers.find((server) => server.id === get().serverId) ?? null;

  const ensureEngine = () => {
    if (engine) return engine;
    void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix" });
    engine = createAudioPlayer(null, { updateInterval: 500 });
    engine.addListener("playbackStatusUpdate", (status) => {
      const { queue, index } = get();
      const track = queue[index];
      if (!track) return;
      set({ position: status.currentTime, duration: status.duration || track.duration, playing: status.playing, ...(status.playing ? { loading: false } : {}) });
      const server = serverOf();
      if (server && !counted && status.currentTime > 0 && status.currentTime >= playedAfter(track.duration)) {
        counted = true;
        void clientFor(server).library.recordPlay.mutate({ trackId: track.id }).catch(() => undefined);
      }
      if (status.didJustFinish) get().next();
    });
    return engine;
  };

  /** Loads the current track and starts it. Gets the one after it ready meanwhile, so it starts at once. */
  const load = async () => {
    const { queue, index } = get();
    const track = queue[index];
    const server = serverOf();
    if (!track || !server) return;
    const audio = ensureEngine();
    const ticket = ++loads;
    counted = false;
    audio.pause();
    set({ loading: true, playing: true, position: 0, duration: track.duration });
    try {
      const source = await sourceFor(server, track);
      if (ticket !== loads) return;
      audio.replace(source);
      audio.play();
      audio.setActiveForLockScreen(true, { title: track.title, artist: track.artistName, albumTitle: track.albumName });
      const upcoming = queue[index + 1];
      tidy([openFile(server.id, track), ...(upcoming ? [openFile(server.id, upcoming)] : [])]);
      if (upcoming) void sourceFor(server, upcoming).catch(() => undefined);
    } catch {
      if (ticket !== loads) return;
      // One track that can't be had shouldn't stop the music: on to the next, if there is one.
      if (index < queue.length - 1) get().next();
      else set({ loading: false, playing: false });
    }
  };

  return {
    queue: [],
    index: 0,
    serverId: null,
    from: null,
    playing: false,
    loading: false,
    position: 0,
    duration: 0,
    play: (server, tracks, startAt = 0, from) => {
      if (!tracks.length) return;
      set({ queue: tracks, index: startAt, serverId: server.id, from: from ?? null });
      void load();
    },
    toggle: () => {
      if (!engine || !get().queue.length) return;
      if (get().playing) engine.pause();
      else engine.play();
      set({ playing: !get().playing });
    },
    next: () => {
      const { queue, index } = get();
      if (index >= queue.length - 1) return set({ playing: false, loading: false });
      set({ index: index + 1 });
      void load();
    },
    previous: () => {
      const { index, position } = get();
      if (index > 0 && position <= restartAfter) {
        set({ index: index - 1 });
        return void load();
      }
      get().seek(0);
    },
    jump: (index) => {
      set({ index });
      void load();
    },
    seek: (seconds) => {
      void engine?.seekTo(seconds);
      set({ position: seconds });
    },
    stop: () => {
      loads++;
      engine?.pause();
      engine?.clearLockScreenControls();
      tidy([]);
      set({ queue: [], index: 0, serverId: null, from: null, playing: false, loading: false, position: 0, duration: 0 });
    },
  };
});

export const useCurrentTrack = () => usePlayer((state) => state.queue[state.index]);
