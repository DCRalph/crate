import "server-only";

import { scopeFor } from "~/server/access";
import { recordActivity } from "~/server/activity";
import { touchAppPassword, verifySubsonicLogin, type SubsonicCredentials } from "~/server/app-passwords";
import { logAccess } from "~/server/logs";
import { clientIp } from "~/server/request-origin";
import { handlers, openSubsonicExtensions, Params, type Context } from "./handlers";
import { SubsonicError, subsonicResponse, type Payload } from "./respond";

const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 5 * 60_000;

/**
 * Failed logins per address and username. After MAX_FAILURES inside the
 * window, further failures from that pair get a 429 and stop being logged one
 * by one. A correct login always works: app passwords are long random secrets,
 * so the limit is there to stop a flood, not to hold off guessing, and a
 * misconfigured client must not lock out the other devices behind the same address.
 */
const failures = new Map<string, { count: number; resetAt: number }>();

function failureFor(key: string) {
  const entry = failures.get(key);
  if (entry && entry.resetAt > Date.now()) return entry;
  failures.delete(key);
  return undefined;
}

/** Passwords may arrive hex-encoded as "enc:...". */
function decodePassword(password: string) {
  return password.startsWith("enc:") ? Buffer.from(password.slice(4), "hex").toString("utf8") : password;
}

/** Works out which login mechanism the client used. Throws when it used none, or two. */
function credentialsFrom(params: URLSearchParams): SubsonicCredentials {
  const apiKey = params.get("apiKey");
  const username = params.get("u");
  if (apiKey) {
    if (username) throw new SubsonicError(43);
    return { kind: "apiKey", apiKey };
  }
  if (!username) throw new SubsonicError(10, "Required parameter is missing: u");
  const token = params.get("t");
  const salt = params.get("s");
  if (token && salt) return { kind: "token", username, token, salt };
  const password = params.get("p");
  if (password) return { kind: "password", username, password: decodePassword(password) };
  throw new SubsonicError(10, "Required parameter is missing: t and s, p, or apiKey");
}

async function authenticate(params: URLSearchParams, request: Request, ip: string | null) {
  const credentials = credentialsFrom(params);
  const client = params.get("c");
  const username = credentials.kind === "apiKey" ? null : credentials.username;
  const key = `${ip}\0${username?.toLowerCase() ?? "api-key"}`;

  const login = await verifySubsonicLogin(credentials);
  if (login) return login;

  const entry = failureFor(key) ?? { count: 0, resetAt: Date.now() + FAILURE_WINDOW_MS };
  entry.count++;
  failures.set(key, entry);
  // A flood of attempts can't grow this without bound.
  if (failures.size > 10_000) for (const [k, v] of failures) if (v.resetAt <= Date.now()) failures.delete(k);

  if (entry.count > MAX_FAILURES) {
    const minutes = Math.ceil((entry.resetAt - Date.now()) / 60_000);
    throw new SubsonicError(40, `Too many failed sign-ins. Try again in ${minutes} min.`, 429);
  }
  await recordActivity({
    action: entry.count === MAX_FAILURES ? "auth.subsonic_locked" : "auth.subsonic_failed",
    actor: { id: null, name: username },
    detail: { client, attempts: entry.count },
    headers: request.headers,
    ip,
  });
  throw new SubsonicError(credentials.kind === "apiKey" ? 44 : 40);
}

/**
 * The Subsonic API: /rest/<method> and /rest/<method>.view, GET or form POST.
 * Signs the caller in with an app password, runs the handler through that
 * user's scope, and writes the access log.
 */
export async function handleSubsonic(request: Request, pathSegments: string[]): Promise<Response> {
  const startedAt = Date.now();
  const method = pathSegments.join("/").replace(/\.view$/, "");
  const params = new URLSearchParams(new URL(request.url).search);
  if (request.method === "POST" && request.headers.get("content-type")?.includes("application/x-www-form-urlencoded")) {
    for (const [name, value] of new URLSearchParams(await request.text())) params.append(name, value);
  }

  const ip = clientIp(request.headers);
  const client = params.get("c");
  const log: Context["log"] = {};
  let user: { id: string; username: string } | undefined;
  let result: Payload | Response | SubsonicError;

  try {
    if (method === "getOpenSubsonicExtensions") {
      return subsonicResponse(params, { openSubsonicExtensions });
    }
    const login = await authenticate(params, request, ip);
    user = login.user;
    void touchAppPassword(login.appPassword, { ip, client }).catch(() => {});

    const handler = handlers[method];
    if (!handler) throw new SubsonicError(0, `Not supported: ${method}`, 501);
    result = await handler({ scope: await scopeFor(login.user), params: new Params(params), request, client, ip, log });
  } catch (error) {
    if (!(error instanceof SubsonicError)) console.error(`[subsonic] ${method} failed:`, error);
    result = error instanceof SubsonicError ? error : new SubsonicError(0);
  }

  const failed = result instanceof SubsonicError ? result : null;
  // Refused-while-blocked requests aren't logged one by one: the block itself is in the activity log.
  if (failed?.httpStatus !== 429) {
    logAccess({
      api: "subsonic",
      endpoint: method,
      userId: user?.id,
      username: user?.username ?? params.get("u"),
      client,
      ip,
      userAgent: request.headers.get("user-agent"),
      ok: !failed,
      error: failed ? `${failed.code}: ${failed.message}` : null,
      trackId: log.trackId,
      durationMs: Date.now() - startedAt,
    });
  }
  return result instanceof Response ? result : subsonicResponse(params, result);
}
