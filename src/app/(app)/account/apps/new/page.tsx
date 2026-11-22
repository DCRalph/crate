import type { Metadata } from "next";

import { NewAppView } from "./new-app-view";

export const metadata: Metadata = { title: "New app" };

export default function NewAppPage() {
  return <NewAppView />;
}
