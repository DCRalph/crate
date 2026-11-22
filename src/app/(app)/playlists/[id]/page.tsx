import type { Metadata } from "next";

import { PlaylistView } from "./playlist-view";

export const metadata: Metadata = { title: "Playlist" };

export default async function PlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  return <PlaylistView id={Number((await params).id)} />;
}
