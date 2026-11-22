"use client";

import { useCallback, useSyncExternalStore } from "react";

/** How the Playlists page lays things out: the folder tree, or big covers. */
export type PlaylistsLayout = "tree" | "grid";

const storageKey = "crate-playlists-layout";
const changed = "crate-playlists-layout-change";

function subscribe(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(changed, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(changed, notify);
  };
}

function read(): PlaylistsLayout {
  try {
    return window.localStorage.getItem(storageKey) === "grid" ? "grid" : "tree";
  } catch {
    return "tree";
  }
}

/** The layout this browser last chose for the Playlists page, and a way to change it. */
export function usePlaylistsLayout() {
  const layout = useSyncExternalStore(subscribe, read, () => "tree" as const);
  const setLayout = useCallback((next: PlaylistsLayout) => {
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      /* A browser that won't store it still gets the change for this visit. */
    }
    window.dispatchEvent(new Event(changed));
  }, []);
  return [layout, setLayout] as const;
}
