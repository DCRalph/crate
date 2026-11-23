import type { Metadata } from "next";

import { getSession } from "~/server/auth/session";
import { HomeView } from "./home-view";

export const metadata: Metadata = { title: "Home" };

export default async function HomePage() {
  const session = await getSession();
  return <HomeView isAdmin={session?.user.role === "admin"} />;
}
