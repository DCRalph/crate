import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, inArray, max, sql } from "drizzle-orm";
import { z } from "zod";

import { auth } from "~/lib/auth";
import { recordActivity } from "~/server/activity";
import { db } from "~/server/db";
import { appPassword, library, libraryAccess } from "~/server/db/app-schema";
import { session, user } from "~/server/db/schema";
import { buildListQuery, listResult, type ListColumnMap } from "~/server/list/build-list-query";
import { listInputSchema } from "~/server/list/list-input";
import { adminProcedure, router } from "../../trpc";

const userId = z.string().min(1);
const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_.]{2,30}$/, "2 to 30 letters, numbers, dots or underscores.");
const password = z.string().min(12, "At least 12 characters.").max(128);
const role = z.enum(["user", "admin"]);
/** A streaming cap in kbps. Null is no cap. */
const maxBitRate = z.number().int().min(32).max(2000).nullable();

// What the list adds to each user: the libraries they were given, their app
// passwords, and when the website last saw them.
const libraries = db
  .select({ userId: libraryAccess.userId, total: count().as("libraries") })
  .from(libraryAccess)
  .groupBy(libraryAccess.userId)
  .as("libraries");
const apps = db
  .select({ userId: appPassword.userId, total: count().as("apps"), lastUsedAt: max(appPassword.lastUsedAt).as("app_seen") })
  .from(appPassword)
  .groupBy(appPassword.userId)
  .as("apps");
const web = db
  .select({ userId: session.userId, lastSeenAt: max(session.updatedAt).as("web_seen") })
  .from(session)
  .groupBy(session.userId)
  .as("web");

const sortName = sql`lower(coalesce(${user.username}, ${user.name}))`;
/** The later of their last app request and their last visit to the website. */
const lastSeen = sql`greatest(${apps.lastUsedAt}, ${web.lastSeenAt})`;

/**
 * What the users table can search, sort and filter on; the keys are its
 * column ids. Search and filters only read the user's own row, which is why
 * `list` can count without the joins.
 */
const columns = {
  username: { column: sortName, type: "text", searchable: true, sortable: true },
  name: { column: user.name, type: "text", searchable: true },
  role: { column: sql`coalesce(${user.role}, 'user')`, type: "enum", sortable: true, filterable: true },
  status: { column: sql`case when ${user.banned} then 'disabled' else 'active' end`, type: "enum", filterable: true },
  createdAt: { column: user.createdAt, type: "date", sortable: true },
  // Never seen sorts as longest ago, not as most recent.
  lastSeenAt: { column: sql`coalesce(${lastSeen}, 'epoch')`, type: "date", sortable: true },
  // Admins reach every library, so they sort as having all of them.
  libraryCount: {
    column: sql`case when ${user.role} = 'admin' then (select count(*) from ${library}) else coalesce(${libraries.total}, 0) end`,
    type: "number",
    sortable: true,
  },
} satisfies ListColumnMap;

async function findUser(id: string) {
  const [found] = await db.select().from(user).where(eq(user.id, id));
  if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
  return found;
}

export const usersRouter = router({
  /** A page of users for the table, each with their library and app counts and when they were last seen. */
  list: adminProcedure.input(listInputSchema).query(async ({ input }) => {
    const query = buildListQuery(columns, input, { defaultSort: [asc(sortName), asc(user.id)] });
    const [rows, total] = await Promise.all([
      db
        .select({
          id: user.id,
          name: user.name,
          username: user.username,
          role: user.role,
          banned: user.banned,
          maxBitRate: user.maxBitRate,
          createdAt: user.createdAt,
          libraryCount: sql<number>`coalesce(${libraries.total}, 0)::int`,
          appPasswordCount: sql<number>`coalesce(${apps.total}, 0)::int`,
          lastSeenAt: sql<Date | null>`${lastSeen}`.mapWith((value: string | null) => (value ? new Date(`${value.replace(" ", "T")}Z`) : null)),
        })
        .from(user)
        .leftJoin(libraries, eq(libraries.userId, user.id))
        .leftJoin(apps, eq(apps.userId, user.id))
        .leftJoin(web, eq(web.userId, user.id))
        .where(query.where)
        .orderBy(...query.orderBy)
        .limit(query.limit)
        .offset(query.offset),
      db.$count(user, query.where),
    ]);
    return listResult(rows, total, input);
  }),

  /** One user, every library with what they can do there, their app passwords, and when they were last seen. */
  byId: adminProcedure.input(z.object({ id: userId })).query(async ({ input }) => {
    const found = await findUser(input.id);
    const [access, appPasswords, [onWeb]] = await Promise.all([
      db
        .select({
          libraryId: library.id,
          name: library.name,
          path: library.path,
          granted: sql<boolean>`${libraryAccess.userId} is not null`,
          canDownload: sql<boolean>`coalesce(${libraryAccess.canDownload}, false)`,
        })
        .from(library)
        .leftJoin(libraryAccess, and(eq(libraryAccess.libraryId, library.id), eq(libraryAccess.userId, input.id)))
        .orderBy(library.name),
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
        .where(eq(appPassword.userId, input.id))
        .orderBy(desc(appPassword.createdAt)),
      db.select({ at: max(session.updatedAt) }).from(session).where(eq(session.userId, input.id)),
    ]);
    // The later of their last app request and their last visit to the website, as in the list.
    const seen = [onWeb?.at, ...appPasswords.map((row) => row.lastUsedAt)].flatMap((at) => (at ? [at.getTime()] : []));
    return {
      id: found.id,
      name: found.name,
      username: found.username,
      role: found.role,
      banned: !!found.banned,
      maxBitRate: found.maxBitRate,
      createdAt: found.createdAt,
      lastSeenAt: seen.length ? new Date(Math.max(...seen)) : null,
      access,
      appPasswords,
    };
  }),

  /**
   * Makes an account, with its streaming limit and the libraries it starts
   * with. Admins reach every library, so `access` is ignored for them.
   */
  create: adminProcedure
    .input(
      z.object({
        username,
        name: z.string().trim().max(80).optional(),
        password,
        role,
        maxBitRate: maxBitRate.default(null),
        access: z.array(z.object({ libraryId: z.number().int(), canDownload: z.boolean() })).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [taken] = await db.select({ id: user.id }).from(user).where(eq(user.username, input.username));
      if (taken) throw new TRPCError({ code: "CONFLICT", message: "That username is taken." });
      // One entry per library, the last one winning.
      const access = input.role === "admin" ? [] : [...new Map(input.access.map((row) => [row.libraryId, row])).values()];
      // Checked before the account exists, so a bad library can't leave half a user behind.
      const granted = access.length
        ? await db
            .select({ id: library.id, name: library.name })
            .from(library)
            .where(inArray(library.id, access.map((row) => row.libraryId)))
        : [];
      const libraryNames = new Map(granted.map((row) => [row.id, row.name]));
      if (access.some((row) => !libraryNames.has(row.libraryId))) throw new TRPCError({ code: "NOT_FOUND", message: "Library not found." });

      const created = await auth.api.createUser({
        headers: ctx.headers,
        body: {
          // better-auth needs an address; nothing is ever sent to it.
          email: `${input.username}@users.invalid`,
          name: input.name || input.username,
          password: input.password,
          role: input.role,
          data: { username: input.username, displayUsername: input.username, emailVerified: true },
        },
      });
      const id = created.user.id;
      if (input.maxBitRate !== null) await db.update(user).set({ maxBitRate: input.maxBitRate }).where(eq(user.id, id));
      if (access.length) {
        await db.insert(libraryAccess).values(access.map((row) => ({ userId: id, libraryId: row.libraryId, canDownload: row.canDownload })));
      }

      await recordActivity({
        action: "user.created",
        actor: ctx.actor,
        target: input.username,
        detail: { role: input.role, ...(input.maxBitRate === null ? {} : { maxBitRate: input.maxBitRate }) },
        headers: ctx.headers,
      });
      // One row per library, the same as a grant made later, so the log answers "who gave them this" either way.
      for (const row of access) {
        await recordActivity({
          action: "access.changed",
          actor: ctx.actor,
          target: input.username,
          detail: { library: libraryNames.get(row.libraryId), access: true, download: row.canDownload },
          headers: ctx.headers,
        });
      }
      return { id };
    }),

  /** Name, role, bitrate cap and whether the account is disabled. Admins can't demote or disable themselves. */
  update: adminProcedure
    .input(
      z.object({
        id: userId,
        name: z.string().trim().min(1, "Enter a name.").max(80).optional(),
        role: role.optional(),
        maxBitRate: maxBitRate.optional(),
        banned: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const found = await findUser(input.id);
      const self = input.id === ctx.scope.user.id;
      if (self && (input.banned || (input.role && input.role !== "admin"))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You can't remove your own admin access." });
      }
      const target = found.username ?? found.name;

      if (input.name !== undefined || input.maxBitRate !== undefined) {
        await db.update(user).set({ name: input.name, maxBitRate: input.maxBitRate }).where(eq(user.id, input.id));
      }
      if (input.role && input.role !== found.role) {
        await auth.api.setRole({ headers: ctx.headers, body: { userId: input.id, role: input.role } });
      }
      if (input.banned !== undefined && input.banned !== !!found.banned) {
        // Banning also signs the user out everywhere.
        if (input.banned) await auth.api.banUser({ headers: ctx.headers, body: { userId: input.id } });
        else await auth.api.unbanUser({ headers: ctx.headers, body: { userId: input.id } });
        await recordActivity({ action: input.banned ? "user.disabled" : "user.enabled", actor: ctx.actor, target, headers: ctx.headers });
      }
      const changes = { name: input.name, role: input.role, maxBitRate: input.maxBitRate };
      if (Object.values(changes).some((value) => value !== undefined)) {
        await recordActivity({ action: "user.updated", actor: ctx.actor, target, detail: changes, headers: ctx.headers });
      }
    }),

  /** Sets a new password and signs the user out of the website everywhere. */
  setPassword: adminProcedure.input(z.object({ id: userId, password })).mutation(async ({ ctx, input }) => {
    const found = await findUser(input.id);
    await auth.api.setUserPassword({ headers: ctx.headers, body: { userId: input.id, newPassword: input.password } });
    if (input.id !== ctx.scope.user.id) {
      await auth.api.revokeUserSessions({ headers: ctx.headers, body: { userId: input.id } });
    }
    await recordActivity({ action: "user.password_reset", actor: ctx.actor, target: found.username ?? found.name, headers: ctx.headers });
  }),

  delete: adminProcedure.input(z.object({ id: userId })).mutation(async ({ ctx, input }) => {
    if (input.id === ctx.scope.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "You can't delete yourself." });
    const found = await findUser(input.id);
    await auth.api.removeUser({ headers: ctx.headers, body: { userId: input.id } });
    await recordActivity({ action: "user.deleted", actor: ctx.actor, target: found.username ?? found.name, headers: ctx.headers });
  }),

  /** Grants or removes a library. `canDownload` only means something with access. */
  setAccess: adminProcedure
    .input(z.object({ userId, libraryId: z.number().int(), granted: z.boolean(), canDownload: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const found = await findUser(input.userId);
      const [lib] = await db.select({ name: library.name }).from(library).where(eq(library.id, input.libraryId));
      if (!lib) throw new TRPCError({ code: "NOT_FOUND", message: "Library not found." });

      const key = and(eq(libraryAccess.userId, input.userId), eq(libraryAccess.libraryId, input.libraryId));
      if (!input.granted) await db.delete(libraryAccess).where(key);
      else {
        await db
          .insert(libraryAccess)
          .values({ userId: input.userId, libraryId: input.libraryId, canDownload: input.canDownload })
          .onConflictDoUpdate({ target: [libraryAccess.userId, libraryAccess.libraryId], set: { canDownload: input.canDownload } });
      }
      await recordActivity({
        action: "access.changed",
        actor: ctx.actor,
        target: found.username ?? found.name,
        detail: { library: lib.name, access: input.granted, download: input.granted && input.canDownload },
        headers: ctx.headers,
      });
    }),

  revokeAppPassword: adminProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    const [removed] = await db.delete(appPassword).where(eq(appPassword.id, input.id)).returning();
    if (!removed) throw new TRPCError({ code: "NOT_FOUND" });
    const owner = await findUser(removed.userId);
    await recordActivity({
      action: "app_password.revoked",
      actor: ctx.actor,
      target: `${owner.username ?? owner.name} · ${removed.name}`,
      headers: ctx.headers,
    });
  }),
});
