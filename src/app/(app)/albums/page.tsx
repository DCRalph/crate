import type { Metadata } from "next";

import { AlbumsView } from "./albums-view";

export const metadata: Metadata = { title: "Albums" };

export default function AlbumsPage() {
  return <AlbumsView />;
}
