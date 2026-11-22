import { create } from "zustand";

type PendingTracks = {
  trackIds: number[];
  /** What they are, for the page to say: a track's title, or "12 tracks". */
  label: string;
  set: (trackIds: number[], label: string) => void;
  clear: () => void;
};

/**
 * Tracks picked with "Add to playlist, New playlist", held while the person
 * is on the New playlist page naming it. Not saved: a reload forgets them.
 */
export const usePendingTracks = create<PendingTracks>()((set) => ({
  trackIds: [],
  label: "",
  set: (trackIds, label) => set({ trackIds, label }),
  clear: () => set({ trackIds: [], label: "" }),
}));
