import type { Metadata } from "next";

import { NewFolderView } from "./new-folder-view";

export const metadata: Metadata = { title: "New folder" };

export default async function NewFolderPage({ searchParams }: { searchParams: Promise<{ parent?: string }> }) {
  const parent = Number((await searchParams).parent);
  return <NewFolderView parentId={Number.isInteger(parent) && parent > 0 ? parent : null} />;
}
