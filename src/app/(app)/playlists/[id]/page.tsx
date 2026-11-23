import type { Metadata } from "next";

import { PlaylistView } from "./playlist-view";
import { idParam } from "~/lib/params";

export const metadata: Metadata = { title: "Playlist" };

export default async function PlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  return <PlaylistView id={idParam((await params).id)} />;
}
