import { useEffect, useEffectEvent } from "react";
import { create } from "zustand";

/**
 * Letters a page can give its rows of tiles, in order. Every letter the
 * deck's keys use (F, L, M, N, P, Q, R, S, V) is left out, so a row's letter
 * is never also a shortcut.
 */
export const rowLetters = ["A", "B", "C", "D", "E", "G", "H", "J", "K"] as const;
export type RowLetter = (typeof rowLetters)[number];

type Selection = {
  /** What has been typed so far ("B3", "12"), shown just above the console while there is any. */
  typed: string;
  /** The lists on screen that a selection can pick from, by letter. A page's one unlettered list is under "". */
  lists: Partial<Record<RowLetter | "", (number: number) => void>>;
  /** Takes a typed key. Says whether it was part of a selection: a digit, or the letter of a row on screen. */
  type: (key: string) => boolean;
  back: () => void;
  clear: () => void;
  /** Plays what has been typed, if the page has it. */
  commit: () => void;
};

const isRowLetter = (key: string): key is RowLetter => (rowLetters as readonly string[]).includes(key);

/**
 * Typing a selection and pressing Enter plays it, the way a jukebox takes
 * one: a row's number ("07") on a page with one list, or a row's letter and
 * a tile's number ("B3") on a page with several. The lists on screen say how
 * through `useNumbered`; the deck listens for the keys and shows what has
 * been typed.
 */
export const useSelection = create<Selection>()((set, get) => ({
  typed: "",
  lists: {},
  type: (key) => {
    const { typed, lists } = get();
    if (/^[0-9]$/.test(key)) {
      // Every digit is kept, so a selection never wraps round to another row; one past the end of the list picks nothing.
      set({ typed: typed + key });
      return true;
    }
    const letter = key.toUpperCase();
    if (!isRowLetter(letter) || !lists[letter]) return false;
    // A letter starts a new selection.
    set({ typed: letter });
    return true;
  },
  back: () => set({ typed: get().typed.slice(0, -1) }),
  clear: () => set({ typed: "" }),
  commit: () => {
    const { typed, lists } = get();
    set({ typed: "" });
    const match = /^([A-Z]?)(\d+)$/.exec(typed);
    if (!match) return;
    const letter = match[1] as RowLetter | "";
    lists[letter]?.(Number(match[2]));
  },
}));

/**
 * Makes a list one that typed selections pick from, for as long as it is on
 * screen. Rows are numbered from 1; `onChoose` gets the row's index. A page
 * with several lists gives each a `letter`; a page with one leaves it out. A
 * list that shows no numbers passes `enabled` false and takes no part.
 */
export function useNumbered(count: number, onChoose: (index: number) => void, enabled = true, letter: RowLetter | "" = "") {
  const choose = useEffectEvent((number: number) => {
    if (number >= 1 && number <= count) onChoose(number - 1);
  });
  useEffect(() => {
    if (!enabled) return;
    const mine = (number: number) => choose(number);
    useSelection.setState((state) => ({ lists: { ...state.lists, [letter]: mine } }));
    return () => {
      // Only if a newer list hasn't already taken the letter over.
      useSelection.setState((state) => {
        if (state.lists[letter] !== mine) return state;
        const lists = { ...state.lists };
        delete lists[letter];
        return { lists };
      });
    };
  }, [enabled, letter]);
}

/** A row's number as printed: two digits at least, "07". */
export const rowNumber = (index: number) => String(index + 1).padStart(2, "0");

/** A tile's code in a lettered row, as printed on its plate: "B3". */
export const tileCode = (letter: RowLetter, index: number) => `${letter}${index + 1}`;
