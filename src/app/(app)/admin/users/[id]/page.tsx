import type { Metadata } from "next";

import { UserView } from "./user-view";

export const metadata: Metadata = { title: "User" };

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  return <UserView id={(await params).id} />;
}
