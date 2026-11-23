import { create } from "zustand";

type Playhead = {
  /** The track the engine has on, and how far into it, in seconds. Kept in step by the engine a few times a second. */
  trackId: number | null;
  time: number;
  /** Moves the playing track to a point. Set by the engine; null before it is ready. */
  seek: ((seconds: number) => void) | null;
  /** A point to start a track at when it is next loaded, for playing a track from a point on its row's waveform. */
  startAt: { trackId: number; seconds: number } | null;
};

/**
 * Where the playing track is, for what draws it outside the console (a row's
 * small waveform), and the way in to move it. The engine owns the sound and
 * keeps this up to date.
 */
export const usePlayhead = create<Playhead>()(() => ({ trackId: null, time: 0, seek: null, startAt: null }));

/** Asks for `trackId` to start at `seconds` when it next loads. Call it just before playing the track. */
export const startTrackAt = (trackId: number, seconds: number) => usePlayhead.setState({ startAt: { trackId, seconds } });

/** The point a just-loaded track was asked to start at, once: 0 when there was none or it was for another track. */
export function takeStartAt(trackId: number) {
  const { startAt } = usePlayhead.getState();
  if (!startAt) return 0;
  usePlayhead.setState({ startAt: null });
  return startAt.trackId === trackId ? startAt.seconds : 0;
}
