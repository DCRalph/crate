import type { Metadata } from "next";

import { AllPlaylistsView } from "./all-playlists-view";

export const metadata: Metadata = { title: "All playlists" };

export default function AllPlaylistsPage() {
  return <AllPlaylistsView />;
}
