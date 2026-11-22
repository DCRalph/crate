import type { Metadata } from "next";

import { ArtistView } from "./artist-view";

export const metadata: Metadata = { title: "Artist" };

export default async function ArtistPage({ params }: { params: Promise<{ id: string }> }) {
  return <ArtistView id={Number((await params).id)} />;
}
