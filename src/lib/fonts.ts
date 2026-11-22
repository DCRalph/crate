import { Big_Shoulders, Jost } from "next/font/google";

// Jost for everything read, and Big Shoulders for numbers and titles, the way
// a jukebox letters its selection numbers.
const body = Jost({ subsets: ["latin"], variable: "--font-body" });
// Next has no fallback metrics for this face, so it is told not to look for them.
const display = Big_Shoulders({ subsets: ["latin"], variable: "--font-display", adjustFontFallback: false });

export const fontVariables = `${body.variable} ${display.variable}`;
