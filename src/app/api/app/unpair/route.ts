import { eq } from "drizzle-orm";

import { recordActivity } from "~/server/activity";
import { verifySubsonicLogin } from "~/server/app-passwords";
import { db } from "~/server/db";
import { appPassword } from "~/server/db/app-schema";

/** A device of the native app signing itself out: its token stops working and it leaves the list of music apps. */
export async function POST(request: Request) {
  const token = /^Bearer (.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1]?.trim();
  const login = token ? await verifySubsonicLogin({ kind: "apiKey", apiKey: token }) : null;
  if (!login) return new Response(null, { status: 401 });
  await db.delete(appPassword).where(eq(appPassword.id, login.appPassword.id));
  await recordActivity({ action: "app.unpaired", actor: { id: login.user.id, name: login.user.username }, target: login.appPassword.name, headers: request.headers });
  return new Response(null, { status: 204 });
}
