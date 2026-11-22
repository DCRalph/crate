import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware, isAPIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin, username } from "better-auth/plugins";

import { env } from "~/env";
import { localHostPatterns } from "~/lib/local-hosts";
import { site } from "~/lib/site";
import { recordActivity } from "~/server/activity";
import { db } from "~/server/db";

/**
 * Web accounts. People sign in with a username (or email) and password; there
 * is no sign-up, admins create accounts. Subsonic clients never use these
 * passwords: they sign in with app passwords (src/server/subsonic/auth.ts).
 */
export const auth = betterAuth({
  appName: site.name,
  // The address is taken from each request, so one server can be signed in to
  // at its public address and over the local network at once. Origins on any
  // allowed host pass better-auth's origin check; what stops one site acting
  // for another is the session cookie, which is SameSite and tied to its host.
  baseURL: {
    allowedHosts: [new URL(env.BETTER_AUTH_URL).host, ...localHostPatterns, ...env.ALLOWED_HOSTS],
    fallback: env.BETTER_AUTH_URL,
    // Both schemes: https at the public address, plain http on the LAN. Without
    // this only https origins are trusted, and anything after the first sign-in
    // (signing out, changing a password) is refused over http.
    protocol: "auto",
  },
  advanced: {
    // Next fills in x-forwarded-proto and -host itself when no proxy has, so these
    // are the request's real scheme and host either way.
    trustedProxyHeaders: true,
    // better-auth decides once, at start-up, whether cookies are Secure. A Secure
    // cookie is dropped by a browser that came in over plain http on the LAN, so it
    // is left off here and added per request in app/api/auth/[...all]/route.ts.
    useSecureCookies: false,
  },
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg" }),
  // No email sender, so admins reset passwords. Impersonation would let an
  // admin's actions be logged as someone else's.
  disabledPaths: [
    "/sign-up/email",
    "/request-password-reset",
    "/reset-password",
    "/is-username-available",
    "/admin/impersonate-user",
    "/admin/stop-impersonating",
  ],
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12 },
  user: {
    additionalFields: {
      // Cap on streaming bitrate in kbps. Anything above it is transcoded down.
      maxBitRate: { type: "number", required: false, input: false },
    },
  },
  // On in development too, so sign-in throttling behaves the same everywhere.
  rateLimit: { enabled: true, window: 60, max: 120 },
  hooks: {
    // The sign-in log: every success and every failure, with where it came from.
    after: createAuthMiddleware(async (ctx) => {
      if (!ctx.path.startsWith("/sign-in")) return;
      const returned = ctx.context.returned;
      const attempted: unknown = ctx.body?.username ?? ctx.body?.email;
      const session = ctx.context.newSession;
      if (session) {
        await recordActivity({
          action: "auth.sign_in",
          actor: { id: session.user.id, name: session.user.username ?? session.user.name },
          headers: ctx.headers,
        });
      } else if (isAPIError(returned)) {
        await recordActivity({
          action: "auth.sign_in_failed",
          actor: { id: null, name: typeof attempted === "string" ? attempted : null },
          detail: { reason: returned.message },
          headers: ctx.headers,
        });
      }
    }),
  },
  plugins: [
    admin({ defaultRole: "user", adminRoles: ["admin"], bannedUserMessage: "This account is disabled. Ask an admin." }),
    username({ minUsernameLength: 2, maxUsernameLength: 30 }),
    // Must stay last: lets server-side auth calls set cookies.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
