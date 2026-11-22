import type { Metadata } from "next";

import { NewUserView } from "./new-user-view";

export const metadata: Metadata = { title: "New user" };

export default function NewUserPage() {
  return <NewUserView />;
}
