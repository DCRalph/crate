import type { Metadata } from "next";

import { ArtistView } from "./artist-view";
import { idParam } from "~/lib/params";

export const metadata: Metadata = { title: "Artist" };

export default async function ArtistPage({ params }: { params: Promise<{ id: string }> }) {
  return <ArtistView id={idParam((await params).id)} />;
}
