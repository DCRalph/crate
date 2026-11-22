import "server-only";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";

import { auth } from "~/lib/auth";
import { scopeFor } from "~/server/access";
import { principalOf } from "~/server/auth/session";

export async function createTRPCContext(opts: { headers: Headers }) {
  return { headers: opts.headers, session: await auth.api.getSession({ headers: opts.headers }) };
}

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  // Input errors reach the client as the first problem's own message, ready to show.
  errorFormatter: ({ shape, error }) =>
    error.cause instanceof ZodError ? { ...shape, message: error.cause.issues[0]?.message ?? "Check what you entered." } : shape,
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

/** Signed-in users. Adds the user's scope, which every library query takes. */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session) throw new TRPCError({ code: "UNAUTHORIZED" });
  const scope = await scopeFor(principalOf(ctx.session.user));
  return next({ ctx: { ...ctx, session: ctx.session, scope, actor: { id: scope.user.id, name: scope.user.username } } });
});

/** Admins only. This check, not the hidden menu, is what keeps admin calls closed. */
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.scope.isAdmin) throw new TRPCError({ code: "FORBIDDEN", message: "Admins only." });
  return next();
});
