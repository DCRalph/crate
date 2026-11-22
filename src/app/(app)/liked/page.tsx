import type { Metadata } from "next";

import { LikedView } from "./liked-view";

export const metadata: Metadata = { title: "Liked" };

export default function LikedPage() {
  return <LikedView />;
}
