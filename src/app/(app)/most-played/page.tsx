import type { Metadata } from "next";

import { MostPlayedView } from "./most-played-view";

export const metadata: Metadata = { title: "Most played" };

export default function MostPlayedPage() {
  return <MostPlayedView />;
}
