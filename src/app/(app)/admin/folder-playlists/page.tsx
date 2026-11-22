import type { Metadata } from "next";

import { FolderPlaylistsView } from "./folder-playlists-view";

export const metadata: Metadata = { title: "Folder playlists" };

export default function FolderPlaylistsPage() {
  return <FolderPlaylistsView />;
}
