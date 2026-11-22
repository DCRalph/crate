import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { env } from "~/env";
import { recordActivity } from "~/server/activity";
import { createAppPassword } from "~/server/app-passwords";
import { db } from "~/server/db";
import { appPassword } from "~/server/db/app-schema";
import { protectedProcedure, router } from "../trpc";

export const accountRouter = router({
  /** What to type into a Subsonic client. */
  connection: protectedProcedure.query(({ ctx }) => ({ serverUrl: env.BETTER_AUTH_URL, username: ctx.scope.user.username })),

  appPasswords: protectedProcedure.query(({ ctx }) =>
    db
      .select({
        id: appPassword.id,
        name: appPassword.name,
        createdAt: appPassword.createdAt,
        lastUsedAt: appPassword.lastUsedAt,
        lastUsedIp: appPassword.lastUsedIp,
        lastUsedClient: appPassword.lastUsedClient,
      })
      .from(appPassword)
      .where(eq(appPassword.userId, ctx.scope.user.id))
      .orderBy(desc(appPassword.createdAt)),
  ),

  /** Returns the secret. This is the only time it can be read. */
  createAppPassword: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1, "Name the device or app.").max(60) }))
    .mutation(async ({ ctx, input }) => {
      const created = await createAppPassword(ctx.scope.user.id, input.name);
      await recordActivity({ action: "app_password.created", actor: ctx.actor, target: input.name, headers: ctx.headers });
      return created;
    }),

  revokeAppPassword: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    const [removed] = await db
      .delete(appPassword)
      .where(and(eq(appPassword.id, input.id), eq(appPassword.userId, ctx.scope.user.id)))
      .returning({ name: appPassword.name });
    if (!removed) throw new TRPCError({ code: "NOT_FOUND" });
    await recordActivity({ action: "app_password.revoked", actor: ctx.actor, target: removed.name, headers: ctx.headers });
  }),
});
