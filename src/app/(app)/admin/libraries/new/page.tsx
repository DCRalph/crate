import type { Metadata } from "next";

import { NewLibraryView } from "./new-library-view";

export const metadata: Metadata = { title: "Add library" };

export default function NewLibraryPage() {
  return <NewLibraryView />;
}
