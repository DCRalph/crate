import "server-only";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";

import { scopeFor } from "~/server/access";
import { callerOf } from "~/server/auth/caller";

/** Every call knows who is asking: someone signed in on the website, or a paired device of the native app. */
export async function createTRPCContext(opts: { headers: Headers }) {
  return { headers: opts.headers, caller: await callerOf(opts.headers) };
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
  if (!ctx.caller) throw new TRPCError({ code: "UNAUTHORIZED" });
  const scope = await scopeFor(ctx.caller.principal);
  return next({ ctx: { ...ctx, caller: ctx.caller, scope, actor: { id: scope.user.id, name: scope.user.username } } });
});

/** Admins only. This check, not the hidden menu, is what keeps admin calls closed. */
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.scope.isAdmin) throw new TRPCError({ code: "FORBIDDEN", message: "Admins only." });
  return next();
});
