import type { Metadata } from "next";

import { LibraryView } from "./library-view";

export const metadata: Metadata = { title: "Library" };

export default async function LibraryPage({ params }: { params: Promise<{ id: string }> }) {
  return <LibraryView id={Number((await params).id)} />;
}
