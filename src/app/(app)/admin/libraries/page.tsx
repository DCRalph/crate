import type { Metadata } from "next";

import { LibrariesView } from "./libraries-view";

export const metadata: Metadata = { title: "Libraries" };

export default function LibrariesPage() {
  return <LibrariesView />;
}
