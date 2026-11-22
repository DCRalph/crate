import { Anybody, Cabin, Montserrat } from "next/font/google";

// Montserrat for UI, Cabin for the header title, and Anybody on its width
// axis (font-stretch) for the wordmark and small caps labels.
const body = Montserrat({ subsets: ["latin"], variable: "--font-body" });
const title = Cabin({ subsets: ["latin"], variable: "--font-title" });
const display = Anybody({ subsets: ["latin"], axes: ["wdth"], variable: "--font-display" });

export const fontVariables = `${body.variable} ${title.variable} ${display.variable}`;
