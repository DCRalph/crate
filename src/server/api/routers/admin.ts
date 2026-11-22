import { stat } from "node:fs/promises";
import path from "node:path";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, ilike, lt, max, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import { auth } from "~/lib/auth";
import { recordActivity } from "~/server/activity";
import { db } from "~/server/db";
import {
  accessLog,
  activity,
  album,
  appPassword,
  folderRule,
  folderRuleModes,
  folderRuleSyncs,
  library,
  libraryAccess,
  playEvent,
  playlist,
  track,
} from "~/server/db/app-schema";
import { session, user } from "~/server/db/schema";
import { scanProgress, startScan } from "~/server/library/scanner";
import { syncFolderRules } from "~/server/playlists/folder-rules";
import { adminProcedure, router } from "../trpc";

const userId = z.string().min(1);
const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_.]{2,30}$/, "2 to 30 letters, numbers, dots or underscores.");
const password = z.string().min(12, "At least 12 characters.").max(128);

/** A page of a log: newest first, continued from the last id seen. */
const logPage = z.object({
  cursor: z.number().int().optional(),
  limit: z.number().int().min(1).max(200).default(100),
  search: z.string().trim().max(100).optional(),
});

const contains = (text: string | undefined, ...columns: Parameters<typeof ilike>[0][]) =>
  text ? or(...columns.map((column) => ilike(column, `%${text.replace(/[\\%_]/g, "\\$&")}%`))) : undefined;

const paged = <T extends { id: number }>(rows: T[], limit: number) => ({
  items: rows,
  nextCursor: rows.length === limit ? rows.at(-1)!.id : null,
});

async function findUser(id: string) {
  const [found] = await db.select().from(user).where(eq(user.id, id));
  if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
  return found;
}

const usersRouter = router({
  list: adminProcedure.query(async () => {
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

    return db
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
        lastSeenAt: sql<Date | null>`greatest(${apps.lastUsedAt}, ${web.lastSeenAt})`.mapWith((value: string | null) =>
          value ? new Date(`${value.replace(" ", "T")}Z`) : null,
        ),
      })
      .from(user)
      .leftJoin(libraries, eq(libraries.userId, user.id))
      .leftJoin(apps, eq(apps.userId, user.id))
      .leftJoin(web, eq(web.userId, user.id))
      .orderBy(sql`lower(coalesce(${user.username}, ${user.name}))`);
  }),

  /** One user, every library with what they can do there, and their app passwords. */
  byId: adminProcedure.input(z.object({ id: userId })).query(async ({ input }) => {
    const found = await findUser(input.id);
    const [access, appPasswords] = await Promise.all([
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
    ]);
    return {
      id: found.id,
      name: found.name,
      username: found.username,
      role: found.role,
      banned: !!found.banned,
      maxBitRate: found.maxBitRate,
      createdAt: found.createdAt,
      access,
      appPasswords,
    };
  }),

  create: adminProcedure
    .input(z.object({ username, name: z.string().trim().max(80).optional(), password, role: z.enum(["user", "admin"]) }))
    .mutation(async ({ ctx, input }) => {
      const [taken] = await db.select({ id: user.id }).from(user).where(eq(user.username, input.username));
      if (taken) throw new TRPCError({ code: "CONFLICT", message: "That username is taken." });
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
      await recordActivity({
        action: "user.created",
        actor: ctx.actor,
        target: input.username,
        detail: { role: input.role },
        headers: ctx.headers,
      });
      return { id: created.user.id };
    }),

  /** Name, role, bitrate cap and whether the account is disabled. Admins can't demote or disable themselves. */
  update: adminProcedure
    .input(
      z.object({
        id: userId,
        name: z.string().trim().min(1).max(80).optional(),
        role: z.enum(["user", "admin"]).optional(),
        maxBitRate: z.number().int().min(32).max(2000).nullable().optional(),
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

/** True when one path is the other, or sits inside it. */
const overlaps = (a: string, b: string) => {
  const inside = (child: string, parent: string) => child === parent || child.startsWith(parent + path.sep);
  return inside(a, b) || inside(b, a);
};

const librariesRouter = router({
  list: adminProcedure.query(async () => {
    const tracks = db
      .select({ libraryId: track.libraryId, total: count().as("tracks") })
      .from(track)
      .groupBy(track.libraryId)
      .as("tracks");
    const albums = db
      .select({ libraryId: album.libraryId, total: count().as("albums") })
      .from(album)
      .groupBy(album.libraryId)
      .as("albums");
    const people = db
      .select({ libraryId: libraryAccess.libraryId, total: count().as("people") })
      .from(libraryAccess)
      .groupBy(libraryAccess.libraryId)
      .as("people");
    const rows = await db
      .select({
        id: library.id,
        name: library.name,
        path: library.path,
        lastScanAt: library.lastScanAt,
        lastScan: library.lastScan,
        trackCount: sql<number>`coalesce(${tracks.total}, 0)::int`,
        albumCount: sql<number>`coalesce(${albums.total}, 0)::int`,
        userCount: sql<number>`coalesce(${people.total}, 0)::int`,
      })
      .from(library)
      .leftJoin(tracks, eq(tracks.libraryId, library.id))
      .leftJoin(albums, eq(albums.libraryId, library.id))
      .leftJoin(people, eq(people.libraryId, library.id))
      .orderBy(library.name);
    return { libraries: rows, scan: scanProgress() };
  }),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().trim().min(1, "Give it a name.").max(60),
        path: z.string().trim().min(1, "Enter the folder's path."),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!path.isAbsolute(input.path)) throw new TRPCError({ code: "BAD_REQUEST", message: "Use a full path, starting with /." });
      const folder = path.resolve(input.path);
      const info = await stat(folder).catch(() => null);
      if (!info?.isDirectory()) throw new TRPCError({ code: "BAD_REQUEST", message: "The server can't find a folder at that path." });

      // A file in two libraries would have two owners, and access is per library.
      const clash = (await db.select().from(library)).find((other) => overlaps(folder, other.path));
      if (clash) throw new TRPCError({ code: "CONFLICT", message: `That folder overlaps the ${clash.name} library.` });

      const [created] = await db.insert(library).values({ name: input.name, path: folder }).returning({ id: library.id });
      await recordActivity({ action: "library.created", actor: ctx.actor, target: input.name, detail: { path: folder }, headers: ctx.headers });
      startScan({ libraryIds: [created!.id], actor: ctx.actor });
      return created!;
    }),

  /** Removes the library and its tracks from the server. Files on disk are untouched. */
  delete: adminProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    if (scanProgress()) throw new TRPCError({ code: "CONFLICT", message: "Wait for the scan to finish." });
    const [removed] = await db.delete(library).where(eq(library.id, input.id)).returning();
    if (!removed) throw new TRPCError({ code: "NOT_FOUND" });
    await recordActivity({ action: "library.deleted", actor: ctx.actor, target: removed.name, detail: { path: removed.path }, headers: ctx.headers });
  }),

  /**
   * Starts a scan of one library, or all of them. `full` reads every file
   * again instead of only new and changed ones. Progress comes back through `list`.
   */
  scan: adminProcedure.input(z.object({ id: z.number().int().optional(), full: z.boolean().default(false) })).mutation(({ ctx, input }) => {
    const started = startScan({ libraryIds: input.id === undefined ? undefined : [input.id], full: input.full, actor: ctx.actor });
    if (!started) throw new TRPCError({ code: "CONFLICT", message: "A scan is already running." });
  }),
});

const folderRulesRouter = router({
  list: adminProcedure.query(async () => {
    const playlists = db
      .select({ ruleId: playlist.ruleId, total: count().as("playlists") })
      .from(playlist)
      .groupBy(playlist.ruleId)
      .as("playlists");
    return db
      .select({
        id: folderRule.id,
        libraryId: folderRule.libraryId,
        libraryName: library.name,
        libraryPath: library.path,
        path: folderRule.path,
        mode: folderRule.mode,
        sync: folderRule.sync,
        isPublic: folderRule.isPublic,
        playlistCount: sql<number>`coalesce(${playlists.total}, 0)::int`,
      })
      .from(folderRule)
      .innerJoin(library, eq(library.id, folderRule.libraryId))
      .leftJoin(playlists, eq(playlists.ruleId, folderRule.id))
      .orderBy(library.name, folderRule.path);
  }),

  /** Adds a rule and builds its playlists straight away from what is already scanned. */
  create: adminProcedure
    .input(
      z.object({
        libraryId: z.number().int(),
        // Inside the library. Leading and trailing slashes don't matter; ".." is not allowed.
        path: z
          .string()
          .trim()
          .max(500)
          .transform((value) => value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""))
          .refine((value) => !value.split("/").includes(".."), "The folder has to be inside the library."),
        mode: z.enum(folderRuleModes),
        sync: z.enum(folderRuleSyncs),
        isPublic: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [lib] = await db.select().from(library).where(eq(library.id, input.libraryId));
      if (!lib) throw new TRPCError({ code: "NOT_FOUND", message: "Library not found." });
      const folder = await stat(path.join(lib.path, input.path)).catch(() => null);
      if (!folder?.isDirectory()) throw new TRPCError({ code: "BAD_REQUEST", message: "There is no folder at that path in the library." });

      const [created] = await db
        .insert(folderRule)
        .values({ ...input, ownerId: ctx.scope.user.id })
        .returning({ id: folderRule.id });
      await syncFolderRules(lib.id, created!.id);
      await recordActivity({
        action: "folder_rule.created",
        actor: ctx.actor,
        target: `${lib.name}/${input.path}`,
        detail: { mode: input.mode, sync: input.sync },
        headers: ctx.headers,
      });
    }),

  /** Removes a rule. Mirrored playlists go with it; seeded ones are ordinary playlists and stay. */
  delete: adminProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    const removed = await db.transaction(async (tx) => {
      await tx.delete(playlist).where(and(eq(playlist.ruleId, input.id), eq(playlist.readOnly, true)));
      const [rule] = await tx.delete(folderRule).where(eq(folderRule.id, input.id)).returning();
      return rule;
    });
    if (!removed) throw new TRPCError({ code: "NOT_FOUND" });
    await recordActivity({ action: "folder_rule.deleted", actor: ctx.actor, target: removed.path || "/", headers: ctx.headers });
  }),
});

const before = (column: typeof activity.id | typeof accessLog.id | typeof playEvent.id, cursor: number | undefined): SQL | undefined =>
  cursor === undefined ? undefined : lt(column, cursor);

const logsRouter = router({
  /** Sign-ins and changes. */
  activity: adminProcedure.input(logPage.extend({ kind: z.enum(["all", "sign-ins", "changes"]).default("all") })).query(async ({ input }) => {
    const kind =
      input.kind === "sign-ins" ? sql`${activity.action} like 'auth.%'` : input.kind === "changes" ? sql`${activity.action} not like 'auth.%'` : undefined;
    const rows = await db
      .select()
      .from(activity)
      .where(and(before(activity.id, input.cursor), kind, contains(input.search, activity.actorName, activity.target, activity.ip)))
      .orderBy(desc(activity.id))
      .limit(input.limit);
    return paged(rows, input.limit);
  }),

  /** Every Subsonic request and media request. */
  requests: adminProcedure.input(logPage.extend({ failedOnly: z.boolean().default(false) })).query(async ({ input }) => {
    const rows = await db
      .select({
        id: accessLog.id,
        at: accessLog.at,
        username: accessLog.username,
        api: accessLog.api,
        endpoint: accessLog.endpoint,
        client: accessLog.client,
        ip: accessLog.ip,
        ok: accessLog.ok,
        error: accessLog.error,
        durationMs: accessLog.durationMs,
        trackTitle: track.title,
      })
      .from(accessLog)
      .leftJoin(track, eq(track.id, accessLog.trackId))
      .where(
        and(
          before(accessLog.id, input.cursor),
          input.failedOnly ? eq(accessLog.ok, false) : undefined,
          contains(input.search, accessLog.username, accessLog.endpoint, accessLog.client, accessLog.ip),
        ),
      )
      .orderBy(desc(accessLog.id))
      .limit(input.limit);
    return paged(rows, input.limit);
  }),

  plays: adminProcedure.input(logPage).query(async ({ input }) => {
    const rows = await db
      .select()
      .from(playEvent)
      .where(and(before(playEvent.id, input.cursor), contains(input.search, playEvent.username, playEvent.title, playEvent.artistName, playEvent.client)))
      .orderBy(desc(playEvent.id))
      .limit(input.limit);
    return paged(rows, input.limit);
  }),
});

export const adminRouter = router({
  users: usersRouter,
  libraries: librariesRouter,
  folderRules: folderRulesRouter,
  logs: logsRouter,
});
