import type { Metadata } from "next";

import { FolderView } from "./folder-view";

export const metadata: Metadata = { title: "Folder" };

export default async function FolderPage({ params }: { params: Promise<{ id: string }> }) {
  return <FolderView id={Number((await params).id)} />;
}
