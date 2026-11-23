import { File, Paths } from "expo-file-system";
import { create } from "zustand";

import { onCloudChange, readCloud, writeCloud } from "./cloud";

/** The most a track is asked for at, in kbps, best first. `null` is the file as it is on the server. */
export const qualities = [null, 320, 192, 128] as const;
export type Quality = (typeof qualities)[number];
export const qualityName = (quality: Quality) => (quality === null ? "Original" : String(quality));

/** How the person wants the app to behave. This is what iCloud carries between their devices; music and sign-ins never are. */
export type Preferences = {
  streamQuality: Quality;
  /** Used for tracks downloaded from now on; what is already on the phone stays as it arrived. */
  downloadQuality: Quality;
  /** Streamed tracks arrive encrypted for this phone too. They start once they have fully arrived. */
  sealStreams: boolean;
  /** The connections downloads, and keeping them up to date, may use. */
  downloadOver: "wifi" | "any";
  /** Downloaded playlists follow the server: tracks added there arrive here, and ones taken out go. */
  syncDownloads: boolean;
};
const defaults: Preferences = { streamQuality: null, downloadQuality: null, sealStreams: true, downloadOver: "wifi", syncDownloads: true };

type Settings = Preferences & {
  /** Whether this phone shares its preferences through iCloud. Each phone chooses for itself. */
  cloudSync: boolean;
  load: () => void;
  change: (patch: Partial<Preferences>) => void;
  setCloudSync: (on: boolean) => void;
};

const isQuality = (value: unknown): value is Quality => qualities.some((quality) => quality === value);

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
    ...(isQuality(found.streamQuality) ? { streamQuality: found.streamQuality } : {}),
    ...(isQuality(found.downloadQuality) ? { downloadQuality: found.downloadQuality } : {}),
    ...(typeof found.sealStreams === "boolean" ? { sealStreams: found.sealStreams } : {}),
    ...(found.downloadOver === "wifi" || found.downloadOver === "any" ? { downloadOver: found.downloadOver } : {}),
    ...(typeof found.syncDownloads === "boolean" ? { syncDownloads: found.syncDownloads } : {}),
    ...(typeof found.cloudSync === "boolean" ? { cloudSync: found.cloudSync } : {}),
  };
}

const preferencesOf = ({ streamQuality, downloadQuality, sealStreams, downloadOver, syncDownloads }: Preferences): Preferences => ({ streamQuality, downloadQuality, sealStreams, downloadOver, syncDownloads });

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
