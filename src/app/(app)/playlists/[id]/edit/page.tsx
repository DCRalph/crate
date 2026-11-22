import type { Metadata } from "next";

import { EditPlaylistView } from "./edit-playlist-view";

export const metadata: Metadata = { title: "Edit playlist" };

export default async function EditPlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  return <EditPlaylistView id={Number((await params).id)} />;
}
