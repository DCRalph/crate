import { useEffect, useEffectEvent } from "react";
import { create } from "zustand";

type Selection = {
  /** Digits typed so far, shown above the deck while there are any. */
  typed: string;
  /** Plays a row of the list on screen, by the number printed on it. */
  choose: ((number: number) => void) | null;
  type: (digit: string) => void;
  back: () => void;
  clear: () => void;
  /** Plays the row whose number has been typed, if the page has one. */
  commit: () => void;
};

/**
 * Typing a row's number and pressing Enter plays it, the way a jukebox takes
 * a selection. The list on screen says how through `useNumbered`; the deck
 * listens for the keys and shows what has been typed.
 */
export const useSelection = create<Selection>()((set, get) => ({
  typed: "",
  choose: null,
  type: (digit) => set({ typed: (get().typed + digit).slice(-4) }),
  back: () => set({ typed: get().typed.slice(0, -1) }),
  clear: () => set({ typed: "" }),
  commit: () => {
    const { typed, choose } = get();
    set({ typed: "" });
    if (typed && choose) choose(Number(typed));
  },
}));

/**
 * Makes a list the one that typed numbers pick from, for as long as it is on
 * screen. Rows are numbered from 1; `onChoose` gets the row's index. A list
 * that shows no numbers passes `enabled` false and takes no part.
 */
export function useNumbered(count: number, onChoose: (index: number) => void, enabled = true) {
  const choose = useEffectEvent((number: number) => {
    if (number >= 1 && number <= count) onChoose(number - 1);
  });
  useEffect(() => {
    if (!enabled) return;
    const mine = (number: number) => choose(number);
    useSelection.setState({ choose: mine });
    return () => {
      // Only if a newer list hasn't already taken over.
      if (useSelection.getState().choose === mine) useSelection.setState({ choose: null });
    };
  }, [enabled]);
}

/** A row's number as printed: two digits at least, "07". */
export const rowNumber = (index: number) => String(index + 1).padStart(2, "0");
