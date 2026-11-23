import type { Metadata } from "next";

import { LibraryView } from "./library-view";
import { idParam } from "~/lib/params";

export const metadata: Metadata = { title: "Library" };

export default async function LibraryPage({ params }: { params: Promise<{ id: string }> }) {
  return <LibraryView id={idParam((await params).id)} />;
}
