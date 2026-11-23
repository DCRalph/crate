import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioSource, type AudioStatus } from "expo-audio";
import { Directory, File, Paths } from "expo-file-system";
import { create } from "zustand";

import { levelFor } from "~/lib/replay-gain";
import { clientFor, type Track } from "./api";
import { sealedFile, useDownloads } from "./downloads";
import { arrivesAs, coverSource, sealedRequest, streamUrl } from "./media";
import { useNetwork } from "./network";
import { onRemote, setRemoteEnabled } from "./remote";
import { openSealed } from "./sealed";
import { authHeaders, useServers, type Server } from "./servers";
import { useSettings } from "./settings";

export type Repeat = "off" | "all" | "one";
/** A queue saved from another of the person's devices, to carry on from. */
export type Offer = { tracks: Track[]; index: number; position: number; device: string | null; changedAt: string };

type Player = {
  /** What plays, in order, and the server it is from. */
  queue: Track[];
  index: number;
  serverId: string | null;
  /** Where the queue was played from ("album:12"), so that page's Play key knows it is the one playing. */
  from: string | null;
  repeat: Repeat;
  /** The queue as it was before it was shuffled, to put back. Null when it isn't shuffled. */
  unshuffled: Track[] | null;
  playing: boolean;
  /** A track has been asked for and its sound hasn't started: arriving, being opened, or buffering. */
  loading: boolean;
  /** Seconds. */
  position: number;
  duration: number;
  offer: Offer | null;
  play: (server: Server, tracks: Track[], startAt?: number, from?: string) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  jump: (index: number) => void;
  seek: (seconds: number) => void;
  /** Puts tracks straight after the one playing. With nothing playing, or a queue from another server, it plays them. */
  playNext: (server: Server, tracks: Track[]) => void;
  /** Adds tracks to the end of the queue, the same way. */
  enqueue: (server: Server, tracks: Track[]) => void;
  removeAt: (index: number) => void;
  setRepeat: (repeat: Repeat) => void;
  toggleShuffle: () => void;
  /** Brings back the queue the app had when it was last open, paused where it was. */
  restore: () => void;
  /** Asks the server whether another device has saved a queue since this one did, and offers it if so. */
  checkOffer: () => Promise<void>;
  acceptOffer: () => void;
  dismissOffer: () => void;
  /** Stops and empties the queue, for when the phone leaves the server it came from. */
  stop: () => void;
};

/** A play counts once the listener is this far in: half the track, or four minutes. */
const playedAfter = (duration: number) => Math.min(duration / 2, 240);
/** Previous goes back a track only this early in one. Later than that it starts the track over. */
const restartAfter = 3;
/** With no crossfade, the next track is started this long before the last one ends: about what starting it takes. */
const gaplessLead = 0.085;
/** How long before a handover the end of the track is watched closely. */
const watchFrom = 1.5;

/**
 * Two audio players, so that the next track can be loaded and waiting on the
 * one that isn't sounding. `live` is the one that is. At the end of a track
 * the other is started as the first runs out (no gap), or under it while the
 * first fades (crossfade), and they change places.
 */
let decks: [AudioPlayer, AudioPlayer] | null = null;
let live: 0 | 1 = 0;
/** Counts loads and handovers, so anything slow that finishes after one knows it is stale. */
let turn = 0;
/** Whether the live deck holds the current track. False for a queue brought back at launch, until Play. */
let loaded = false;
/** The queue position the spare deck has loaded and waiting. */
let ready: { index: number; trackId: number } | null = null;
let counted = false;
/** Where to move to once a freshly loaded track can be moved in. */
let pendingSeek = 0;
let failures = 0;
let watching: ReturnType<typeof setInterval> | null = null;
let fading: { timer: ReturnType<typeof setInterval>; out: AudioPlayer; into: AudioPlayer; level: number } | null = null;
let afterHandover: ReturnType<typeof setTimeout> | null = null;

/** The quality a stream is asked for at, on the connection the phone has now. */
const streamQuality = () => (useNetwork.getState().mobileData ? useSettings.getState().streamQualityMobile : useSettings.getState().streamQuality);

/** Where tracks are opened into to be played. Emptied of everything but what is playing as the queue moves on. */
const openDirectory = () => new Directory(Paths.cache, "playing");
/** The track as it is on the phone, if it has been downloaded. */
const downloadOf = (serverId: string, track: Track) => {
  const entry = useDownloads.getState().shelves[serverId]?.tracks[track.id];
  return entry?.state === "downloaded" ? entry : null;
};
/** The file a track is opened into. Named for the kind of audio inside: what it was downloaded as, or what it streams as now. */
const openFile = (serverId: string, track: Track) =>
  new File(openDirectory(), `${serverId.replace(/\W/g, "").slice(-12)}-${track.id}.${downloadOf(serverId, track)?.suffix ?? arrivesAs(track, streamQuality())}`);

/**
 * What an audio player is given for a track. A downloaded track is opened
 * from its sealed file. A streamed one is fetched sealed and opened the same
 * way when streams are encrypted, which is the default; otherwise it plays
 * straight from the server as it arrives. An opened file only exists while
 * it plays.
 */
async function sourceFor(server: Server, track: Track): Promise<AudioSource> {
  const downloaded = downloadOf(server.id, track);
  const quality = streamQuality();
  if (!downloaded && !useSettings.getState().sealStreams) return { uri: streamUrl(server, track, quality), headers: authHeaders(server) };

  const directory = openDirectory();
  if (!directory.exists) directory.create({ intermediates: true });
  const out = openFile(server.id, track);
  if (out.exists) return { uri: out.uri };
  if (downloaded) {
    await openSealed(sealedFile(server.id, track.id), out, server.sealKey);
    return { uri: out.uri };
  }
  const { url, headers } = sealedRequest(server, track, quality);
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

/** Removes every opened file but the ones named. A file a player still has open stays readable to it until it lets go. */
function tidy(keep: File[]) {
  const directory = openDirectory();
  if (!directory.exists) return;
  const names = new Set(keep.map((file) => file.name));
  for (const item of directory.list()) if (item instanceof File && !names.has(item.name) && !item.name.endsWith(".arriving") && item.name !== "cover.jpg") item.delete();
}

// The queue as it was when the app was last open, and what this phone knows of the queue saved on the server.
type Saved = Pick<Player, "queue" | "index" | "serverId" | "from" | "repeat" | "unshuffled" | "position"> & { syncedAt?: string; dismissedAt?: string };
const savedFile = () => new File(Paths.document, "queue.json");
/** When the server last took this phone's queue, by the server's clock. A later time there means another device has saved since. */
let syncedAt: string | undefined;
/** An offer the person turned down, so it isn't made again. */
let dismissedAt: string | undefined;

const shuffled = <T>(items: T[]) => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};

/**
 * The play queue and what is sounding. It carries on with the screen locked,
 * puts the track on the lock screen, and answers Next and Previous from
 * there. The queue is saved on the phone as it changes, so the app opens
 * where it was left, and on the server, so another device can carry on.
 */
export const usePlayer = create<Player>()((set, get) => {
  const serverOf = () => useServers.getState().servers.find((server) => server.id === get().serverId) ?? null;
  const levelOf = (track: Track) => levelFor(track, useSettings.getState().normalise);
  const spare = () => (live === 0 ? 1 : 0);

  /** The queue position that follows the current one by itself: the next, or back to the first when repeating all. */
  const upcoming = () => {
    const { queue, index, repeat } = get();
    if (index < queue.length - 1) return index + 1;
    return repeat === "all" && queue.length > 1 ? 0 : null;
  };

  const stopWatching = () => {
    if (watching) clearInterval(watching);
    watching = null;
  };
  /** Ends a crossfade where it is: the old track stops and the new one is at its full level. */
  const stopFading = () => {
    if (!fading) return;
    clearInterval(fading.timer);
    fading.out.pause();
    fading.into.volume = fading.level;
    fading = null;
  };
  const settle = () => {
    stopWatching();
    stopFading();
    if (afterHandover) clearTimeout(afterHandover);
    afterHandover = null;
  };

  // --- Saving the queue: on the phone, and on the server for other devices. ---

  let saveSoon: ReturnType<typeof setTimeout> | null = null;
  let pushSoon: ReturnType<typeof setTimeout> | null = null;
  let lastSaved = 0;
  const saveHere = () => {
    lastSaved = Date.now();
    const { queue, index, serverId, from, repeat, unshuffled, position } = get();
    const file = savedFile();
    if (!file.exists) file.create();
    file.write(JSON.stringify({ queue, index, serverId, from, repeat, unshuffled, position, syncedAt, dismissedAt } satisfies Saved));
  };
  const push = () => {
    const server = serverOf();
    const { queue, index, position } = get();
    if (!server || !queue.length || !useSettings.getState().syncQueue) return;
    void clientFor(server)
      .queue.save.mutate({ trackIds: queue.map((track) => track.id), currentId: queue[index]?.id ?? null, positionMs: Math.round(position * 1000) })
      .then((saved) => {
        syncedAt = saved.changedAt.toISOString();
        saveHere();
      })
      .catch(() => undefined);
  };
  /** The queue, or what is playing in it, changed: both copies follow shortly, and the lock screen's buttons are set to match. */
  const changed = () => {
    if (saveSoon) clearTimeout(saveSoon);
    saveSoon = setTimeout(saveHere, 800);
    if (pushSoon) clearTimeout(pushSoon);
    pushSoon = setTimeout(push, 3000);
    setRemoteEnabled(upcoming() !== null, get().queue.length > 0);
  };

  // --- The decks. ---

  /** Puts a track on the lock screen, with its cover once that has been fetched. */
  const announce = (deck: AudioPlayer, track: Track) => {
    const about = { title: track.title, artist: track.artistName, albumTitle: track.albumName };
    deck.setActiveForLockScreen(true, about);
    const server = serverOf();
    if (!server) return;
    // The lock screen can't send the phone's token, so the cover is fetched to a file first.
    const cover = coverSource(server, "album", track.albumId, 600);
    const file = new File(openDirectory(), "cover.jpg");
    const marker = turn;
    if (file.exists) file.delete();
    void File.downloadFileAsync(cover.uri, file, { headers: cover.headers })
      .then(() => marker === turn && deck.updateLockScreenMetadata({ ...about, artworkUrl: file.uri }))
      .catch(() => undefined);
  };

  /** The live deck said something: where it is, whether it is sounding, that it finished. */
  const heard = (status: AudioStatus) => {
    const { queue, index } = get();
    const track = queue[index];
    const deck = decks?.[live];
    if (!track || !deck || !loaded) return;
    if (pendingSeek && status.isLoaded) {
      void deck.seekTo(pendingSeek);
      pendingSeek = 0;
      return;
    }
    const duration = status.duration || track.duration;
    // While a track is on its way the deck isn't sounding yet, which is not the same as paused.
    set({ ...(pendingSeek ? {} : { position: status.currentTime }), duration, playing: get().loading ? true : status.playing, ...(status.playing ? { loading: false } : {}) });
    if (status.playing) failures = 0;

    const server = serverOf();
    if (server && !counted && status.currentTime > 0 && status.currentTime >= playedAfter(track.duration)) {
      counted = true;
      void clientFor(server).library.recordPlay.mutate({ trackId: track.id }).catch(() => undefined);
    }
    if (status.playing && Date.now() - lastSaved > 15_000) {
      saveHere();
      push();
    }
    if (status.didJustFinish) return ended();

    // Near the end, with the next track waiting: watch closely, and hand over at the right moment.
    const to = upcoming();
    if (!status.playing || watching || fading || get().repeat === "one" || to === null || ready?.index !== to) return;
    const next = queue[to];
    const crossfade = useSettings.getState().crossfade;
    // A fade needs room in both tracks; a short one is handed over without.
    const lead = next && crossfade && duration > crossfade * 2 && next.duration > crossfade * 2 ? crossfade : gaplessLead;
    if (duration - status.currentTime > lead + watchFrom) return;
    watching = setInterval(() => {
      const left = deck.duration - deck.currentTime;
      if (!deck.playing) return stopWatching();
      if (left > lead) return;
      stopWatching();
      handover(lead === gaplessLead ? 0 : Math.max(left, 0.2));
    }, 16);
  };

  const ensureDecks = () => {
    if (decks) return decks;
    void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix" });
    const make = (slot: 0 | 1) => {
      const deck = createAudioPlayer(null, { updateInterval: 500 });
      deck.addListener("playbackStatusUpdate", (status) => {
        if (slot === live) heard(status);
      });
      return deck;
    };
    decks = [make(0), make(1)];
    onRemote("onNext", () => get().next());
    onRemote("onPrevious", () => get().previous());
    return decks;
  };

  /** Loads what follows onto the spare deck, so it can start the instant it is wanted. */
  const prepare = async () => {
    const server = serverOf();
    const { queue, index, repeat } = get();
    const current = queue[index];
    const to = upcoming();
    const next = to === null ? undefined : queue[to];
    if (!server || !decks || !current) return;
    tidy([openFile(server.id, current), ...(next ? [openFile(server.id, next)] : [])]);
    if (to === null || !next || repeat === "one") return void (ready = null);
    if (ready?.index === to && ready.trackId === next.id) return;
    ready = null;
    const marker = turn;
    try {
      const source = await sourceFor(server, next);
      // Something else was chosen, or the queue changed, while it was on its way.
      if (marker !== turn || upcoming() !== to || get().queue[to]?.id !== next.id) return;
      const deck = decks[spare()];
      deck.pause();
      deck.replace(source);
      deck.volume = levelOf(next);
      ready = { index: to, trackId: next.id };
    } catch {
      // It is asked for again, and reported, when its turn comes.
    }
  };

  /**
   * Starts the waiting track and makes it the one that is playing. With
   * `fadeFor` seconds the two overlap, one fading out under the other; with
   * none the old track is left to run out, which it is about to (or is
   * stopped, when the person skipped: `cut`).
   */
  const handover = (fadeFor: number, cut = false) => {
    const to = upcoming();
    const next = to === null ? undefined : get().queue[to];
    if (!decks || to === null || !next || ready?.index !== to) return false;
    settle();
    const out = decks[live];
    live = spare();
    const into = decks[live];
    const level = levelOf(next);
    turn++;
    ready = null;
    counted = false;
    into.volume = fadeFor ? 0 : level;
    into.play();
    if (cut) out.pause();
    set({ index: to, position: 0, duration: next.duration, playing: true, loading: false });
    announce(into, next);
    changed();

    if (fadeFor) {
      const from = out.volume;
      const started = Date.now();
      const timer = setInterval(() => {
        const share = Math.min(1, (Date.now() - started) / (fadeFor * 1000));
        out.volume = from * (1 - share);
        into.volume = level * share;
        if (share >= 1) stopFading();
      }, 50);
      fading = { timer, out, into, level };
    }
    // The deck that just finished is the spare now; it is given the following track once it has gone quiet.
    afterHandover = setTimeout(() => void prepare(), fadeFor * 1000 + 400);
    return true;
  };

  /** Loads the current track onto the live deck and starts it, `at` seconds in. */
  const load = async (at = 0) => {
    const { queue, index } = get();
    const track = queue[index];
    const server = serverOf();
    if (!track || !server) return;
    const [first, second] = ensureDecks();
    settle();
    const marker = ++turn;
    counted = false;
    ready = null;
    loaded = false;
    first.pause();
    second.pause();
    set({ loading: true, playing: true, position: at, duration: track.duration });
    changed();
    try {
      const source = await sourceFor(server, track);
      if (marker !== turn) return;
      const deck = [first, second][live]!;
      deck.replace(source);
      deck.volume = levelOf(track);
      pendingSeek = at;
      loaded = true;
      deck.play();
      announce(deck, track);
      void prepare();
    } catch {
      if (marker !== turn) return;
      // One track that can't be had shouldn't stop the music: on to the next. But not round and round a queue none of which can be had.
      failures++;
      const to = upcoming();
      if (to === null || failures >= queue.length) return set({ loading: false, playing: false });
      set({ index: to });
      void load();
    }
  };

  /** The live deck reached the end of its track with nothing waiting to take over. */
  const ended = () => {
    const { repeat, queue } = get();
    const deck = decks?.[live];
    const to = upcoming();
    if (deck && (repeat === "one" || (repeat === "all" && queue.length === 1))) {
      counted = false;
      // Play only once it is back at the start: asked for at the end of a track, it does nothing.
      return void deck.seekTo(0).then(() => deck.play());
    }
    if (to === null) return set({ playing: false, loading: false });
    set({ index: to });
    void load();
  };

  /** Starts a queue: `tracks` from `startAt`, `at` seconds in. */
  const begin = (server: Server, tracks: Track[], startAt: number, from: string | null, at = 0) => {
    set({ queue: tracks, index: startAt, serverId: server.id, from, unshuffled: null, offer: null });
    failures = 0;
    void load(at);
  };

  /** After the queue was edited around the current track: what follows may be different now. */
  const edited = () => {
    ready = null;
    changed();
    if (loaded) void prepare();
  };

  return {
    queue: [],
    index: 0,
    serverId: null,
    from: null,
    repeat: "off",
    unshuffled: null,
    playing: false,
    loading: false,
    position: 0,
    duration: 0,
    offer: null,
    play: (server, tracks, startAt = 0, from) => {
      if (tracks.length) begin(server, tracks, startAt, from ?? null);
    },
    toggle: () => {
      const { queue, playing, position } = get();
      if (!queue.length) return;
      // A queue brought back at launch hasn't been loaded yet.
      if (!loaded) return void load(position);
      const deck = decks?.[live];
      if (!deck) return;
      if (playing) {
        stopFading();
        deck.pause();
        saveHere();
        push();
      } else deck.play();
      set({ playing: !playing });
    },
    next: () => {
      const { queue, index } = get();
      const to = upcoming() ?? (index < queue.length - 1 ? index + 1 : null);
      if (to === null) return;
      // Already loaded and waiting: it starts at once.
      if (loaded && handover(0, true)) return;
      set({ index: to });
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
      if (!get().queue[index]) return;
      set({ index });
      void load();
    },
    seek: (seconds) => {
      stopWatching();
      if (loaded) void decks?.[live]?.seekTo(seconds);
      set({ position: seconds });
    },
    playNext: (server, tracks) => {
      const { queue, index, serverId, unshuffled } = get();
      if (!tracks.length) return;
      if (!queue.length || serverId !== server.id) return begin(server, tracks, 0, null);
      set({ queue: [...queue.slice(0, index + 1), ...tracks, ...queue.slice(index + 1)], unshuffled: unshuffled && [...unshuffled, ...tracks] });
      edited();
    },
    enqueue: (server, tracks) => {
      const { queue, serverId, unshuffled } = get();
      if (!tracks.length) return;
      if (!queue.length || serverId !== server.id) return begin(server, tracks, 0, null);
      set({ queue: [...queue, ...tracks], unshuffled: unshuffled && [...unshuffled, ...tracks] });
      edited();
    },
    removeAt: (at) => {
      const { queue, index, unshuffled } = get();
      const gone = queue[at];
      if (!gone) return;
      if (queue.length === 1) return get().stop();
      const rest = queue.filter((_, position) => position !== at);
      const without = unshuffled && unshuffled.filter((track, position) => position !== unshuffled.indexOf(gone));
      if (at !== index) {
        set({ queue: rest, index: at < index ? index - 1 : index, unshuffled: without });
        return edited();
      }
      // The one playing: what was after it plays now, or the new last track if it was the last.
      set({ queue: rest, index: Math.min(index, rest.length - 1), unshuffled: without });
      if (loaded) void load();
      else changed();
    },
    setRepeat: (repeat) => {
      set({ repeat });
      edited();
    },
    toggleShuffle: () => {
      const { queue, index, unshuffled } = get();
      const current = queue[index];
      if (!current) return;
      // What has been played stays where it is; only what is still to come is mixed.
      if (!unshuffled) set({ unshuffled: queue, queue: [...queue.slice(0, index + 1), ...shuffled(queue.slice(index + 1))] });
      else set({ queue: unshuffled, index: Math.max(0, unshuffled.indexOf(current)), unshuffled: null });
      edited();
    },
    restore: () => {
      const file = savedFile();
      if (!file.exists || get().queue.length) return;
      let saved: Partial<Saved> = {};
      try {
        saved = JSON.parse(file.textSync()) as Partial<Saved>;
      } catch {
        // Cut short by the app being closed mid-write: start with nothing.
      }
      ({ syncedAt, dismissedAt } = saved);
      const current = saved.queue?.[saved.index ?? 0];
      if (!saved.queue || !current || !useServers.getState().servers.some((server) => server.id === saved.serverId)) return;
      set({
        queue: saved.queue,
        index: saved.index ?? 0,
        serverId: saved.serverId ?? null,
        from: saved.from ?? null,
        repeat: saved.repeat ?? "off",
        unshuffled: saved.unshuffled ?? null,
        position: saved.position ?? 0,
        duration: current.duration,
      });
    },
    checkOffer: async () => {
      const server = useServers.getState().servers.find((candidate) => candidate.id === useServers.getState().activeId);
      if (!server || get().playing || !useSettings.getState().syncQueue) return;
      const saved = await clientFor(server)
        .queue.get.query()
        .catch(() => null);
      if (!saved || get().playing) return;
      const changedAt = saved.changedAt.toISOString();
      // This phone's own last save, or an offer already turned down.
      if (changedAt === syncedAt || changedAt === dismissedAt) return set({ offer: null });
      set({ offer: { tracks: saved.tracks, index: Math.max(0, saved.tracks.findIndex((track) => track.id === saved.currentId)), position: saved.positionMs / 1000, device: saved.changedBy, changedAt } });
    },
    acceptOffer: () => {
      const { offer } = get();
      const server = useServers.getState().servers.find((candidate) => candidate.id === useServers.getState().activeId);
      if (!offer || !server) return;
      syncedAt = offer.changedAt;
      begin(server, offer.tracks, offer.index, null, offer.position);
    },
    dismissOffer: () => {
      dismissedAt = get().offer?.changedAt;
      set({ offer: null });
      saveHere();
    },
    stop: () => {
      settle();
      turn++;
      loaded = false;
      ready = null;
      decks?.[0].pause();
      decks?.[1].pause();
      decks?.[live].clearLockScreenControls();
      tidy([]);
      set({ queue: [], index: 0, serverId: null, from: null, unshuffled: null, playing: false, loading: false, position: 0, duration: 0 });
      if (saveSoon) clearTimeout(saveSoon);
      if (pushSoon) clearTimeout(pushSoon);
      saveHere();
    },
  };
});

export const useCurrentTrack = () => usePlayer((state) => state.queue[state.index]);
