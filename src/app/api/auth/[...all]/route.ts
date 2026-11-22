import { toNextJsHandler } from "better-auth/next-js";

import { env } from "~/env";
import { auth } from "~/lib/auth";
import { overHttps } from "~/server/request-origin";

const handlers = toNextJsHandler(auth);

/**
 * Runs better-auth, then marks the cookies it set as Secure when the request
 * came over https. Done here per request, not in the auth config, because the
 * same server is also reached over plain http on the local network, where a
 * Secure cookie would never be stored and sign-in would silently do nothing.
 */
async function handle(request: Request) {
  const response = await (request.method === "POST" ? handlers.POST : handlers.GET)(request);
  const cookies = response.headers.getSetCookie();
  if (!cookies.length || !overHttps(request.headers, env.BETTER_AUTH_URL)) return response;

  const headers = new Headers(response.headers);
  headers.delete("set-cookie");
  for (const cookie of cookies) headers.append("set-cookie", /;\s*secure\b/i.test(cookie) ? cookie : `${cookie}; Secure`);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export { handle as GET, handle as POST };
