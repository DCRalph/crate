import "server-only";

import { auth } from "~/lib/auth";
import type { Principal } from "~/server/access";
import { touchAppPassword, verifySubsonicLogin } from "~/server/app-passwords";
import { clientIp } from "~/server/request-origin";
import { principalOf } from "./session";

/** Who a request is from, and what they are using: "Web", or the name the native app's device was given when it paired. */
export type Caller = { principal: Principal; client: string; viaApp: boolean };

/**
 * Works out who is asking. The website sends its session cookie. The native
 * app sends `Authorization: Bearer` with the token it got when it paired,
 * which is an app password like any other device's: listed under Music apps
 * and revocable on its own. Null when it is neither, or the account is disabled.
 */
export async function callerOf(headers: Headers): Promise<Caller | null> {
  const token = /^Bearer (.+)$/i.exec(headers.get("authorization") ?? "")?.[1]?.trim();
  if (token) {
    const login = await verifySubsonicLogin({ kind: "apiKey", apiKey: token });
    if (!login) return null;
    await touchAppPassword(login.appPassword, { ip: clientIp(headers), client: headers.get("x-crate-client")?.slice(0, 80) ?? "Crate app" });
    return { principal: { ...login.user, name: login.user.name }, client: login.appPassword.name, viaApp: true };
  }
  const session = await auth.api.getSession({ headers });
  return session ? { principal: principalOf(session.user), client: "Web", viaApp: false } : null;
}
