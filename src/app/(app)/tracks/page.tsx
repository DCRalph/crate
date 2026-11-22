import type { Metadata } from "next";

import { TracksView } from "./tracks-view";

export const metadata: Metadata = { title: "Tracks" };

export default function TracksPage() {
  return <TracksView />;
}
