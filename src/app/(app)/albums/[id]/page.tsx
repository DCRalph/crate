import type { Metadata } from "next";

import { AlbumView } from "./album-view";

export const metadata: Metadata = { title: "Album" };

export default async function AlbumPage({ params }: { params: Promise<{ id: string }> }) {
  return <AlbumView id={Number((await params).id)} />;
}
