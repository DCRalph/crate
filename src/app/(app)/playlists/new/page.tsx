import type { Metadata } from "next";

import { NewPlaylistView } from "./new-playlist-view";

export const metadata: Metadata = { title: "New playlist" };

export default async function NewPlaylistPage({ searchParams }: { searchParams: Promise<{ folder?: string }> }) {
  const folder = Number((await searchParams).folder);
  return <NewPlaylistView folderId={Number.isInteger(folder) && folder > 0 ? folder : null} />;
}
