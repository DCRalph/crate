import type { Metadata } from "next";

import { AlbumView } from "./album-view";
import { idParam } from "~/lib/params";

export const metadata: Metadata = { title: "Album" };

export default async function AlbumPage({ params }: { params: Promise<{ id: string }> }) {
  return <AlbumView id={idParam((await params).id)} />;
}
