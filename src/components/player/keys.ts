"use client";

import { useEffect, useEffectEvent } from "react";

import { useSelection } from "./selection";
import { useShortcutsHelp } from "./shortcuts";
import { useNowPlayingView } from "./now-playing-view";
import { usePlayer } from "./store";

/** What Space presses when it has the keyboard's focus. */
const spaceControls = "button, a, [role=button], [role=checkbox], [role=switch], [role=radio], [role=tab], [role=option]";

/** A step of the volume keys. */
const volumeStep = 0.1;

/**
 * The deck's keys, listed in `shortcuts`. Space plays and pauses, a row's
 * letter and digits then Enter pick a selection ("B3", "07"), and the other
 * letters work the transport, unless the key
 * belongs to a field, a menu or a slider, or a dialog is asking something.
 * The queue is a dialog only in name: the page behind it is still in use.
 * What needs the audio element or the deck's own state comes in as `actions`.
 */
export function useDeckKeys(actions: { seekBy: (seconds: number) => void; back: () => void; toggleQueue: () => void }) {
  /** Acts on a plain key. Says whether it was one of ours. */
  const press = useEffectEvent((key: string) => {
    const player = usePlayer.getState();
    switch (key) {
      case "arrowleft":
        return actions.seekBy(-5), true;
      case "arrowright":
        return actions.seekBy(5), true;
      case "n":
        if (player.index < player.queue.length - 1 || player.repeat !== "off") player.next();
        return true;
      case "p":
        return actions.back(), true;
      case "s":
        return player.toggleShuffle(), true;
      case "r":
        return player.cycleRepeat(), true;
      case "m":
        return player.toggleMute(), true;
      case "-":
        return player.setVolume(Math.max(0, player.volume - volumeStep)), true;
      case "=":
      case "+":
        return player.setVolume(Math.min(1, player.volume + volumeStep)), true;
      case "l":
        // The heart on the deck does the liking; this presses it.
        return document.querySelector<HTMLElement>("#player-bar [data-like]")?.click(), true;
      case "q":
        return actions.toggleQueue(), true;
      case "v":
        if (player.queue.length) useNowPlayingView.getState().toggle();
        return true;
      case "?":
        return useShortcutsHelp.setState({ open: true }), true;
      default:
        return false;
    }
  });

  useEffect(() => {
    let idle: ReturnType<typeof setTimeout> | undefined;
    let spaceTaken = false;
    /** The control that has focus only because it was just clicked. Tab hands the keyboard back to the controls. */
    let clicked: Element | null = null;
    const onPointerDown = (event: PointerEvent) => {
      clicked = event.target instanceof Element ? event.target.closest(spaceControls) : null;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Tab") clicked = null;
      const target = event.target;
      if (event.metaKey || event.ctrlKey || event.altKey || !(target instanceof HTMLElement)) return;
      if (target.closest("input, textarea, select, [contenteditable], [role=menu], [role=listbox], [role=slider], [role=alertdialog]")) return;
      if (target.closest("[role=dialog]:not([data-queue])")) return;
      const selection = useSelection.getState();

      // A digit, or the letter of a row of tiles on screen: part of a selection. Letters that aren't a row's fall
      // through to the shortcuts. Not while Now playing covers the page, whose rows can't be seen.
      const covered = useNowPlayingView.getState().open;
      if (covered && selection.typed) selection.clear();
      if (!covered && !event.repeat && event.key.length === 1 && selection.type(event.key)) {
        // A selection left half typed is forgotten after a few seconds.
        clearTimeout(idle);
        idle = setTimeout(selection.clear, 4000);
      } else if (selection.typed && event.key === "Enter") {
        // Enter belongs to the selection while one is being typed, even with a button focused.
        event.preventDefault();
        selection.commit();
      } else if (selection.typed && event.key === "Backspace") selection.back();
      else if (selection.typed && event.key === "Escape") selection.clear();
      // A control reached with the keyboard keeps Space for itself. One that only has focus because it was just
      // clicked doesn't: Space after clicking Next should pause, not skip again.
      else if (event.code === "Space") {
        if ((target.closest(spaceControls) ?? clicked) !== clicked) return;
        event.preventDefault();
        spaceTaken = true;
        if (event.repeat) return;
        const state = usePlayer.getState();
        state.setPlaying(!state.playing);
      }
      // The arrows belong to tabs and radio groups when the keyboard is on one.
      else if (event.key.startsWith("Arrow") && target.closest("[role=tablist], [role=radiogroup]")) return;
      else if (!event.repeat && press(event.key.toLowerCase())) event.preventDefault();
    };
    // Some browsers press a focused button when Space comes up, whatever happened on the way down.
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space" || !spaceTaken) return;
      spaceTaken = false;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      clearTimeout(idle);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, []);
}
