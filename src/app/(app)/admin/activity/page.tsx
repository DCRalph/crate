import type { Metadata } from "next";
import { Suspense } from "react";

import { ActivityView } from "./activity-view";

export const metadata: Metadata = { title: "Activity" };

export default function ActivityPage() {
  return (
    // The view reads the open tab from the URL's query, as the search page reads its own.
    <Suspense>
      <ActivityView />
    </Suspense>
  );
}
