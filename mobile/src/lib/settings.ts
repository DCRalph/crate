import { File, Paths } from "expo-file-system";
import { create } from "zustand";

import type { Normalise } from "~/lib/replay-gain";
import { onCloudChange, readCloud, writeCloud } from "./cloud";

/** The most a track is asked for at, in kbps, best first. `null` is the file as it is on the server. */
export const qualities = [null, 320, 192, 128] as const;
export type Quality = (typeof qualities)[number];
export const qualityName = (quality: Quality) => (quality === null ? "Original" : String(quality));

/** Seconds one track fades into the next. 0 is none: the next starts as the last one ends. */
export const crossfades = [0, 3, 6, 9] as const;
/** Tracks downloaded at the same time. */
export const downloadCounts = [2, 4, 6] as const;
export const appearances = ["auto", "day", "night"] as const;
/** How Now playing is laid out: everything (with the queue), or the cover, the name and the keys alone. */
export const nowPlayingModes = ["detailed", "minimal"] as const;
/** The colour of the band: title strips, the Play key, switches. Each is light enough to carry ink. */
export const accents = {
  coral: { band: "#ef5b34", bandDown: "#c94522" },
  amber: { band: "#f2a630", bandDown: "#c9841c" },
  mint: { band: "#5fc9a3", bandDown: "#3f9f7c" },
  sky: { band: "#63b5e8", bandDown: "#3f8ebf" },
  rose: { band: "#f17c9c", bandDown: "#c95776" },
} as const;
export type Accent = keyof typeof accents;

/** How the person wants the app to behave. This is what iCloud carries between their devices; music and sign-ins never are. */
export type Preferences = {
  streamQuality: Quality;
  /** The same, while the phone is on mobile data. */
  streamQualityMobile: Quality;
  /** Evens out loudness from the ReplayGain in the files. */
  normalise: Normalise;
  crossfade: (typeof crossfades)[number];
  /** The queue is saved to the server as it changes, so another device can carry on from it. */
  syncQueue: boolean;
  /** Used for tracks downloaded from now on; what is already on the phone stays as it arrived. */
  downloadQuality: Quality;
  /** Streamed tracks arrive encrypted for this phone too. They start once they have fully arrived. */
  sealStreams: boolean;
  /** The connections downloads, and keeping them up to date, may use. */
  downloadOver: "wifi" | "any";
  /** Downloaded playlists follow the server: tracks added there arrive here, and ones taken out go. */
  syncDownloads: boolean;
  downloadsAtOnce: (typeof downloadCounts)[number];
  /** Day or night whatever the phone says, or following it. */
  appearance: (typeof appearances)[number];
  accent: Accent;
  nowPlaying: (typeof nowPlayingModes)[number];
};
const defaults: Preferences = {
  streamQuality: null,
  streamQualityMobile: null,
  normalise: "off",
  crossfade: 0,
  syncQueue: true,
  downloadQuality: null,
  sealStreams: true,
  downloadOver: "wifi",
  syncDownloads: true,
  downloadsAtOnce: 2,
  appearance: "auto",
  accent: "coral",
  nowPlaying: "detailed",
};

type Settings = Preferences & {
  /** Whether this phone shares its preferences through iCloud. Each phone chooses for itself. */
  cloudSync: boolean;
  load: () => void;
  change: (patch: Partial<Preferences>) => void;
  setCloudSync: (on: boolean) => void;
};

/** Whether `value` is one of `choices`, for reading a saved choice back. */
const oneOf = <const T>(choices: readonly T[], value: unknown): value is T => choices.some((choice) => choice === value);
const accentNames = Object.keys(accents) as Accent[];

/** The preferences in a saved string, leaving out anything that isn't one: it may come from a newer or older version of the app on another device. */
function parse(saved: string | null): Partial<Preferences> & { cloudSync?: boolean } {
  let found: Record<string, unknown> | null = null;
  try {
    found = saved ? (JSON.parse(saved) as Record<string, unknown> | null) : null;
  } catch {
    // Not ours, or cut short.
  }
  if (!found || typeof found !== "object") return {};
  return {
    ...(oneOf(qualities, found.streamQuality) ? { streamQuality: found.streamQuality } : {}),
    ...(oneOf(qualities, found.streamQualityMobile) ? { streamQualityMobile: found.streamQualityMobile } : {}),
    ...(oneOf(["off", "track", "album"], found.normalise) ? { normalise: found.normalise } : {}),
    ...(oneOf(crossfades, found.crossfade) ? { crossfade: found.crossfade } : {}),
    ...(typeof found.syncQueue === "boolean" ? { syncQueue: found.syncQueue } : {}),
    ...(oneOf(qualities, found.downloadQuality) ? { downloadQuality: found.downloadQuality } : {}),
    ...(oneOf(downloadCounts, found.downloadsAtOnce) ? { downloadsAtOnce: found.downloadsAtOnce } : {}),
    ...(oneOf(appearances, found.appearance) ? { appearance: found.appearance } : {}),
    ...(oneOf(accentNames, found.accent) ? { accent: found.accent } : {}),
    ...(oneOf(nowPlayingModes, found.nowPlaying) ? { nowPlaying: found.nowPlaying } : {}),
    ...(typeof found.sealStreams === "boolean" ? { sealStreams: found.sealStreams } : {}),
    ...(found.downloadOver === "wifi" || found.downloadOver === "any" ? { downloadOver: found.downloadOver } : {}),
    ...(typeof found.syncDownloads === "boolean" ? { syncDownloads: found.syncDownloads } : {}),
    ...(typeof found.cloudSync === "boolean" ? { cloudSync: found.cloudSync } : {}),
  };
}

/** Only the preferences out of the store, in the order of `defaults`. */
const preferencesOf = (state: Preferences) => Object.fromEntries((Object.keys(defaults) as (keyof Preferences)[]).map((key) => [key, state[key]])) as Preferences;

const file = () => new File(Paths.document, "settings.json");

/**
 * The app's settings. Saved on the phone, and, when the person turns iCloud
 * on, in their iCloud too: a change here goes there, and a change made on
 * another device arrives here while the app runs.
 */
export const useSettings = create<Settings>()((set, get) => {
  const saveHere = () => {
    const saved = file();
    if (!saved.exists) saved.create();
    saved.write(JSON.stringify({ ...preferencesOf(get()), cloudSync: get().cloudSync }));
  };
  /** Takes on what iCloud holds. Only preferences: whether to use iCloud at all is this phone's own choice. */
  const adopt = (fromCloud: string | null) => {
    const { cloudSync: _theirs, ...preferences } = parse(fromCloud);
    set(preferences);
    saveHere();
  };

  onCloudChange((value) => {
    if (get().cloudSync) adopt(value);
  });

  return {
    ...defaults,
    cloudSync: false,
    load: () => {
      const saved = file();
      set(parse(saved.exists ? saved.textSync() : null));
      if (get().cloudSync) adopt(readCloud());
    },
    change: (patch) => {
      set(patch);
      saveHere();
      if (get().cloudSync) writeCloud(JSON.stringify(preferencesOf(get())));
    },
    setCloudSync: (cloudSync) => {
      set({ cloudSync });
      saveHere();
      if (!cloudSync) return;
      // What is already in iCloud wins, so turning this on on a second phone brings the first one's choices over.
      const there = readCloud();
      if (there) adopt(there);
      else writeCloud(JSON.stringify(preferencesOf(get())));
    },
  };
});
