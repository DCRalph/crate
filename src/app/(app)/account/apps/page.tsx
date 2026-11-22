import type { Metadata } from "next";

import { AppsView } from "./apps-view";

export const metadata: Metadata = { title: "Music apps" };

export default function AppsPage() {
  return <AppsView />;
}
