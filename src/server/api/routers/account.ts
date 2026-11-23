import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { env } from "~/env";
import { recordActivity } from "~/server/activity";
import { createAppPassword } from "~/server/app-passwords";
import { db } from "~/server/db";
import { appPassword } from "~/server/db/app-schema";
import { user } from "~/server/db/schema";
import { requestOrigin } from "~/server/request-origin";
import { protectedProcedure, router } from "../trpc";

export const accountRouter = router({
  /** Who is signed in: the name the app shows for them, and the username they sign in with. */
  profile: protectedProcedure.query(({ ctx }) => ({ name: ctx.scope.user.name, username: ctx.scope.user.username })),

  /** Changes the name the app shows for this person. Their username, which is what they sign in with, stays as it is. */
  updateName: protectedProcedure.input(z.object({ name: z.string().trim().min(1, "Enter a name.").max(80) })).mutation(async ({ ctx, input }) => {
    await db.update(user).set({ name: input.name }).where(eq(user.id, ctx.scope.user.id));
    await recordActivity({
      action: "user.updated",
      actor: ctx.actor,
      target: ctx.scope.user.username,
      detail: { name: input.name },
      headers: ctx.headers,
    });
  }),

  /** What to type into a Subsonic client: the address this person is using right now, so it works from where they are. */
  connection: protectedProcedure.query(({ ctx }) => ({
    serverUrl: requestOrigin(ctx.headers, env.BETTER_AUTH_URL),
    username: ctx.scope.user.username,
  })),

  /** What the web player has to work within: the streaming bitrate cap an admin set for this person, in kbps, if any. */
  playback: protectedProcedure.query(({ ctx }) => ({ maxBitRate: ctx.scope.maxBitRate })),

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
    if (!removed) throw new TRPCError({ code: "NOT_FOUND", message: "App password not found." });
    await recordActivity({ action: "app_password.revoked", actor: ctx.actor, target: removed.name, headers: ctx.headers });
  }),
});
