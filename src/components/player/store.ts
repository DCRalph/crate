import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { WebTrack } from "~/server/api/routers/library";

type PlayerState = {
  queue: WebTrack[];
  /** Position of the current track in `queue`. */
  index: number;
  playing: boolean;
  /** 0 to 1. */
  volume: number;
  /** Replaces the queue and starts playing at `startAt`. */
  play: (tracks: WebTrack[], startAt?: number) => void;
  /** Adds to the end of the queue. Starts playing if nothing was queued. */
  enqueue: (tracks: WebTrack[]) => void;
  jump: (index: number) => void;
  remove: (index: number) => void;
  next: () => void;
  previous: () => void;
  setPlaying: (playing: boolean) => void;
  setVolume: (volume: number) => void;
};

/**
 * The play queue. The audio element lives in PlayerBar and follows this store.
 * The queue and volume survive a reload; `playing` doesn't, because browsers
 * won't start audio without a click.
 */
export const usePlayer = create<PlayerState>()(
  persist(
    (set, get) => ({
      queue: [],
      index: 0,
      playing: false,
      volume: 1,
      play: (tracks, startAt = 0) => set({ queue: tracks, index: startAt, playing: tracks.length > 0 }),
      enqueue: (tracks) => {
        const { queue } = get();
        set(queue.length ? { queue: [...queue, ...tracks] } : { queue: tracks, index: 0, playing: true });
      },
      jump: (index) => set({ index, playing: true }),
      remove: (index) => {
        const { queue, index: current } = get();
        const next = queue.filter((_, i) => i !== index);
        set({
          queue: next,
          // Keep pointing at the same track when one before it goes.
          index: Math.min(index < current ? current - 1 : current, Math.max(next.length - 1, 0)),
          playing: next.length ? get().playing : false,
        });
      },
      next: () => {
        const { queue, index } = get();
        if (index < queue.length - 1) set({ index: index + 1, playing: true });
        else set({ playing: false });
      },
      previous: () => set({ index: Math.max(get().index - 1, 0), playing: true }),
      setPlaying: (playing) => set({ playing: playing && get().queue.length > 0 }),
      setVolume: (volume) => set({ volume }),
    }),
    {
      name: "crate-player",
      partialize: ({ queue, index, volume }) => ({ queue, index, volume }),
      // Rehydrated by PlayerBar after mount, so the server and first client render agree.
      skipHydration: true,
    },
  ),
);

export const useCurrentTrack = () => usePlayer((state) => state.queue[state.index]);
