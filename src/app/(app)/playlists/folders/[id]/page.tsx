import type { Metadata } from "next";

import { FolderView } from "./folder-view";
import { idParam } from "~/lib/params";

export const metadata: Metadata = { title: "Folder" };

export default async function FolderPage({ params }: { params: Promise<{ id: string }> }) {
  return <FolderView id={idParam((await params).id)} />;
}
