import type { Metadata } from "next";

import { ArtistsView } from "./artists-view";

export const metadata: Metadata = { title: "Artists" };

export default function ArtistsPage() {
  return <ArtistsView />;
}
