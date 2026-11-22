import { requireAdmin } from "~/server/auth/session";

/** Admin pages are for admins. Everyone else is sent back to the library. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin("/admin/users");
  return children;
}
