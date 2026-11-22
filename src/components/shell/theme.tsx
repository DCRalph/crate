"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

/** Day, night, or whatever the device is set to. */
export type ThemeChoice = "auto" | "day" | "night";

const storageKey = "crate-theme";
const changed = "crate-theme-change";

/**
 * Runs in <head> before the first paint, so the page never flashes the wrong
 * cabinet. Night is the `dark` class on <html>; day is its absence.
 */
export const themeScript = `(function(){try{var c=localStorage.getItem("${storageKey}");var n=c==="night"||(c!=="day"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",n)}catch(e){}})()`;

function read(): ThemeChoice {
  try {
    const saved = window.localStorage.getItem(storageKey);
    return saved === "day" || saved === "night" ? saved : "auto";
  } catch {
    return "auto";
  }
}

function apply() {
  const choice = read();
  const night = choice === "night" || (choice === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", night);
}

function subscribe(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(changed, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(changed, notify);
  };
}

/** The person's choice of theme, kept in this browser, and a way to change it. */
export function useThemeChoice() {
  const choice = useSyncExternalStore(subscribe, read, () => "auto" as const);
  const setChoice = useCallback((next: ThemeChoice) => {
    try {
      if (next === "auto") window.localStorage.removeItem(storageKey);
      else window.localStorage.setItem(storageKey, next);
    } catch {
      /* A browser that won't store it still gets the change for this visit. */
    }
    window.dispatchEvent(new Event(changed));
  }, []);
  return [choice, setChoice] as const;
}

/** Keeps <html> in step when the choice changes, here or in another tab, and when the device switches while on Auto. */
export function ThemeSync() {
  useEffect(() => {
    const device = window.matchMedia("(prefers-color-scheme: dark)");
    const stop = subscribe(apply);
    device.addEventListener("change", apply);
    return () => {
      stop();
      device.removeEventListener("change", apply);
    };
  }, []);
  return null;
}
