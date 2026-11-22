import type { Metadata } from "next";

import { PlaybackView } from "./playback-view";

export const metadata: Metadata = { title: "Playback" };

export default function PlaybackPage() {
  return <PlaybackView />;
}
