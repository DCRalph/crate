import { useColorScheme } from "react-native";

/**
 * Wallbox, natively: the same jukebox selector panel as the website
 * (`src/app/globals.css`). The cabinet is seafoam enamel by day and petrol
 * green by night and follows the phone. Print (cards, strips, rows) is ivory
 * with ink at any hour. The deck is always the night cabinet. Coral is the
 * band a title strip carries; amber is a lamp, and means something is live.
 */
const day = {
  cab: "#bcdcd5",
  cab2: "#a9d0c8",
  cab3: "#97c4bb",
  line: "#7fb0a7",
  chrome: "#0e2b2f",
  chrome2: "#35595d",
  field: "#fbf6e7",
  strip: "#fbf6e7",
  strip2: "#f0e6cc",
  stripLine: "#d6c9a6",
  isNight: false,
};
const night: typeof day = {
  cab: "#0e2b2f",
  cab2: "#12363b",
  cab3: "#1a4449",
  line: "#2b565b",
  chrome: "#e3ebe8",
  chrome2: "#93adab",
  field: "#071a1d",
  strip: "#f3ead4",
  strip2: "#e7dbbd",
  stripLine: "#cdbf9b",
  isNight: true,
};

export type Palette = typeof day;

/** The cabinet as the phone has it now. */
export const usePalette = (): Palette => (useColorScheme() === "light" ? day : night);
/** The deck's cabinet, which is night whatever the hour. */
export const deck = night;

export const ink = "#1b1a16";
export const ink2 = "#5b5545";
export const band = "#ef5b34";
export const bandDown = "#c94522";
export const lamp = "#ffc44d";
export const glass = "#071a1d";
export const bad = "#b3261e";

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 3, md: 6, lg: 8 } as const;

/** Jost for everything read; Big Shoulders for numbers and titles. Loaded in the root layout. */
export const font = {
  body: "Jost_400Regular",
  medium: "Jost_500Medium",
  semi: "Jost_600SemiBold",
  title: "BigShouldersDisplay_800ExtraBold",
  num: "BigShouldersDisplay_700Bold",
} as const;

/** Capitals for strips and keys, the web's `t-label`. */
export const label = { fontFamily: font.semi, textTransform: "uppercase", letterSpacing: 0.9 } as const;
