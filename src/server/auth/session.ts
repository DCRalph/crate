import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth, type Session } from "~/lib/auth";
import type { Principal } from "~/server/access";

/** The current session, deduped per request. */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

/** The session's user as access checks see it. */
export function principalOf(user: Session["user"]): Principal {
  return {
    id: user.id,
    name: user.name,
    username: user.username ?? user.email,
    email: user.email,
    role: user.role,
    maxBitRate: user.maxBitRate,
  };
}

/** For pages: any signed-in user, else off to sign in and back to `next`. */
export async function requireUser(next: string) {
  const session = await getSession();
  if (!session) redirect(`/signin?next=${encodeURIComponent(next)}`);
  return session;
}

/** For pages: admins only. Everyone else lands on the library. */
export async function requireAdmin(next: string) {
  const session = await requireUser(next);
  if (session.user.role !== "admin") redirect("/albums");
  return session;
}

/** Only same-site paths are allowed as post-sign-in destinations, so `?next=` can't bounce someone to another origin. */
export function safeNext(next: string | string[] | undefined | null, fallback = "/albums") {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}
