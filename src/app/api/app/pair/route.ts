import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "~/lib/auth";
import { recordActivity } from "~/server/activity";
import { createAppPassword } from "~/server/app-passwords";
import { db } from "~/server/db";
import { account, user } from "~/server/db/schema";
import { clientIp } from "~/server/request-origin";

const body = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
  /** What the device is called in the list of music apps, "William's iPhone" say. */
  device: z.string().trim().min(1).max(60),
});

// Guessing a password here is the same as guessing it on the sign-in page, so it is slowed the same way: by address.
const attempts = new Map<string, { count: number; until: number }>();
const allowed = 10;
const window = 5 * 60_000;

function tooMany(ip: string) {
  const now = Date.now();
  const seen = attempts.get(ip);
  if (!seen || seen.until < now) {
    attempts.set(ip, { count: 1, until: now + window });
    return false;
  }
  return ++seen.count > allowed;
}

/**
 * Pairs a device of the native app with an account. The account's password is
 * used this once and never kept on the device: what comes back is a token of
 * the device's own, which is an app password and so shows under Music apps,
 * with when and where it was last used, and can be revoked by itself.
 */
export async function POST(request: Request) {
  const ip = clientIp(request.headers) ?? "unknown";
  if (tooMany(ip)) return Response.json({ message: "Too many tries. Wait a few minutes." }, { status: 429 });
  const input = body.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ message: "Enter a username and a password." }, { status: 400 });

  const [found] = await db
    .select({ id: user.id, name: user.name, username: user.username, role: user.role, banned: user.banned, hash: account.password })
    .from(user)
    .innerJoin(account, and(eq(account.userId, user.id), eq(account.providerId, "credential")))
    .where(eq(user.username, input.data.username.toLowerCase()));
  const context = await auth.$context;
  const matches = !!found?.hash && (await context.password.verify({ hash: found.hash, password: input.data.password }));
  if (!found || !matches || found.banned) {
    await recordActivity({ action: "auth.sign_in_failed", actor: { id: null, name: input.data.username }, detail: { reason: "Wrong username or password", app: input.data.device }, headers: request.headers });
    return Response.json({ message: "Wrong username or password." }, { status: 401 });
  }

  const { secret } = await createAppPassword(found.id, input.data.device);
  await recordActivity({ action: "app.paired", actor: { id: found.id, name: found.username ?? found.name }, target: input.data.device, headers: request.headers });
  return Response.json({ token: secret, user: { id: found.id, name: found.name, username: found.username ?? found.name, isAdmin: found.role === "admin" } });
}
