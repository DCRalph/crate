import type { Metadata } from "next";

import { getSession } from "~/server/auth/session";
import { AlbumsView } from "./albums-view";

export const metadata: Metadata = { title: "Albums" };

export default async function AlbumsPage() {
  const session = await getSession();
  return <AlbumsView isAdmin={session?.user.role === "admin"} />;
}
