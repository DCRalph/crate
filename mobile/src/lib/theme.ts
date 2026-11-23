import { createContext, useContext, useMemo } from "react";
import { useColorScheme } from "react-native";

import { accents, useSettings } from "./settings";

/**
 * Wallbox, natively: the same cabinet as the website (`src/app/globals.css`).
 * The music is behind glass: every page of the library, Now playing and the
 * deck sit on the dark glass window, the same at any hour, so covers and lamps
 * read alike by day and by night. The enamel cabinet, seafoam by day and
 * petrol green by night, is what the settings are on. Print (cards, strips,
 * rows) is ivory with ink at any hour. The band a title strip carries is
 * coral unless the person picked another colour in Settings; amber is a lamp,
 * and means something is live.
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

export type Palette = typeof day & (typeof accents)[keyof typeof accents];

/** The cabinet as the phone has it now (Settings can hold it to day or night; the root layout tells the system), with the band in the colour chosen. */
export function usePalette(): Palette {
  const isNight = useColorScheme() !== "light";
  const accent = useSettings((state) => state.accent);
  return useMemo(() => ({ ...(isNight ? night : day), ...accents[accent] }), [isNight, accent]);
}
/** The deck's cabinet, which is night whatever the hour. */
export const deck = night;

/**
 * What a page is set on: the glass window, or the cabinet. A page says which
 * (`Screen`; anything outside one is on the cabinet), and what is drawn on
 * it reads its colours from `useGround`, so a note or a heading is pale on
 * glass and lettered in chrome on the cabinet.
 */
export type Ground = "glass" | "cabinet";
export const GroundContext = createContext<Ground>("cabinet");

/** The colours of the ground a part is on: its colour, the lettering on it and the quieter lettering. */
export function useGround() {
  const ground = useContext(GroundContext);
  const palette = usePalette();
  return ground === "glass" ? { ground, base: glass, chrome: deck.chrome, chrome2: deck.chrome2, line: glassLine, isNight: true } : { ground, base: palette.cab, chrome: palette.chrome, chrome2: palette.chrome2, line: palette.line, isNight: palette.isNight };
}

export const ink = "#1b1a16";
export const ink2 = "#5b5545";
export const lamp = "#ffc44d";
export const glass = "#071a1d";
/** Hairlines on glass, and the edge of a small window set into it (`inset`). */
export const glassLine = "#1d4247";
export const insetLine = "#2b565b";
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
