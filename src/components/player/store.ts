import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { WebTrack } from "~/server/api/routers/library";
import type { TranscodeFormat } from "~/server/media/transcode";

/** The bitrates offered as a quality, in kbps, best first. "Original" (no limit) sits above them. */
export const qualities = [320, 256, 192, 128, 96];

/** How volume is evened out: not at all, each track to the same level, or each album keeping its own quiet and loud tracks. */
export type Normalise = "off" | "track" | "album";

/** What happens at the end: stop, go round the queue again, or play the same track again. */
export type Repeat = "off" | "all" | "one";
const repeats: Repeat[] = ["off", "all", "one"];

/** A copy in a random order. */
function shuffled<T>(items: readonly T[]) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/** The current track first, then every other track in a random order. */
const shuffledFrom = (tracks: WebTrack[], first: number) =>
  tracks.length ? [tracks[first]!, ...shuffled(tracks.filter((_, i) => i !== first))] : [];

const placeOf = (tracks: WebTrack[], track: WebTrack | undefined) => (track ? tracks.findIndex((item) => item.id === track.id) : -1);

type PlayerState = {
  /** What plays, in the order it plays. */
  queue: WebTrack[];
  /** Position of the current track in `queue`. */
  index: number;
  /** While shuffle is on, the queue in the order it was lined up, to go back to. Null when shuffle is off. */
  lineup: WebTrack[] | null;
  repeat: Repeat;
  playing: boolean;
  /** 0 to 1. */
  volume: number;
  /** What `volume` was before muting. */
  volumeBeforeMute: number;
  /** The most to stream at, in kbps. Null is the original file. */
  quality: number | null;
  /** What a track is converted to when it has to be. */
  format: TranscodeFormat;
  normalise: Normalise;
  /** Tracks that failed to play as they are in this browser, by id. They are converted for the rest of the session. */
  unplayable: ReadonlySet<number>;
  /** Replaces the queue and starts playing at `startAt`. Left out, that is the first track, or any track when shuffle is on. */
  play: (tracks: WebTrack[], startAt?: number) => void;
  /** Adds to the end of the queue. Starts playing if nothing was queued. */
  enqueue: (tracks: WebTrack[]) => void;
  /** Adds straight after the current track. Starts playing if nothing was queued. */
  playNext: (tracks: WebTrack[]) => void;
  /** Shuffle on puts everything but the current track in a random order; off puts the queue back as it was lined up. */
  toggleShuffle: () => void;
  /** Off, then all, then one. */
  cycleRepeat: () => void;
  jump: (index: number) => void;
  remove: (index: number) => void;
  /** On to the next track. Past the last one it goes round again when repeating, and stops otherwise. */
  next: () => void;
  previous: () => void;
  setPlaying: (playing: boolean) => void;
  setVolume: (volume: number) => void;
  /** Mutes, or goes back to the volume it was muted from. */
  toggleMute: () => void;
  setQuality: (quality: number | null) => void;
  setFormat: (format: TranscodeFormat) => void;
  setNormalise: (normalise: Normalise) => void;
  markUnplayable: (trackId: number) => void;
  /** Keeps queued copies of a track in step when it is liked or unliked. */
  setStarred: (trackId: number, starred: boolean) => void;
};

/**
 * The play queue and the playback preferences. The audio element lives in
 * PlayerBar and follows this store. The queue, shuffle, repeat, volume and
 * preferences are kept in this browser and survive a reload; `playing`
 * doesn't, because browsers won't start audio without a click, and
 * `unplayable` starts empty each time.
 */
export const usePlayer = create<PlayerState>()(
  persist(
    (set, get) => ({
      queue: [],
      index: 0,
      lineup: null,
      repeat: "off",
      playing: false,
      volume: 1,
      volumeBeforeMute: 1,
      quality: null,
      format: "mp3",
      normalise: "off",
      unplayable: new Set(),
      play: (tracks, startAt) => {
        const playing = tracks.length > 0;
        if (get().lineup === null) set({ queue: tracks, index: startAt ?? 0, playing });
        else set({ lineup: tracks, queue: shuffledFrom(tracks, startAt ?? Math.floor(Math.random() * tracks.length)), index: 0, playing });
      },
      enqueue: (tracks) => {
        const { queue, lineup, play } = get();
        if (!queue.length) play(tracks);
        else set({ queue: [...queue, ...tracks], lineup: lineup && [...lineup, ...tracks] });
      },
      playNext: (tracks) => {
        const { queue, index, lineup, play } = get();
        if (!queue.length) return play(tracks, 0);
        set({
          queue: queue.toSpliced(index + 1, 0, ...tracks),
          lineup: lineup && lineup.toSpliced(placeOf(lineup, queue[index]) + 1, 0, ...tracks),
        });
      },
      toggleShuffle: () => {
        const { queue, index, lineup } = get();
        if (lineup === null) set({ lineup: queue, queue: shuffledFrom(queue, index), index: 0 });
        else set({ lineup: null, queue: lineup, index: Math.max(placeOf(lineup, queue[index]), 0) });
      },
      cycleRepeat: () => set({ repeat: repeats[(repeats.indexOf(get().repeat) + 1) % repeats.length] }),
      jump: (index) => set({ index, playing: true }),
      remove: (index) => {
        const { queue, index: current, lineup } = get();
        const next = queue.filter((_, i) => i !== index);
        const place = lineup ? placeOf(lineup, queue[index]) : -1;
        set({
          queue: next,
          lineup: lineup && lineup.filter((_, i) => i !== place),
          // Keep pointing at the same track when one before it goes.
          index: Math.min(index < current ? current - 1 : current, Math.max(next.length - 1, 0)),
          playing: next.length ? get().playing : false,
        });
      },
      next: () => {
        const { queue, index, repeat } = get();
        if (index < queue.length - 1) set({ index: index + 1, playing: true });
        else if (repeat !== "off" && queue.length) set({ index: 0, playing: true });
        else set({ playing: false });
      },
      previous: () => set({ index: Math.max(get().index - 1, 0), playing: true }),
      setPlaying: (playing) => set({ playing: playing && get().queue.length > 0 }),
      setVolume: (volume) => set({ volume }),
      toggleMute: () => {
        const { volume, volumeBeforeMute } = get();
        set(volume ? { volume: 0, volumeBeforeMute: volume } : { volume: volumeBeforeMute || 1 });
      },
      setQuality: (quality) => set({ quality }),
      setFormat: (format) => set({ format }),
      setNormalise: (normalise) => set({ normalise }),
      markUnplayable: (trackId) => set({ unplayable: new Set(get().unplayable).add(trackId) }),
      setStarred: (trackId, starred) => {
        const mark = (tracks: WebTrack[]) => tracks.map((track) => (track.id === trackId ? { ...track, starred } : track));
        const { queue, lineup } = get();
        set({ queue: mark(queue), lineup: lineup && mark(lineup) });
      },
    }),
    {
      name: "crate-player",
      partialize: ({ queue, index, lineup, repeat, volume, quality, format, normalise }) => ({ queue, index, lineup, repeat, volume, quality, format, normalise }),
      // Rehydrated by PlayerBar after mount, so the server and first client render agree.
      skipHydration: true,
    },
  ),
);

export const useCurrentTrack = () => usePlayer((state) => state.queue[state.index]);

/**
 * Where the current track sits in the order it was lined up, which is the
 * number printed on its row. Shuffle changes what plays next, not this.
 * Null with nothing playing.
 */
export const usePlayingPlace = () =>
  usePlayer((state) => {
    const track = state.queue[state.index];
    if (!track) return null;
    return state.lineup ? placeOf(state.lineup, track) : state.index;
  });
