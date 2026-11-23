import { stat } from "node:fs/promises";
import path from "node:path";
import { TRPCError } from "@trpc/server";
import { count, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { recordActivity } from "~/server/activity";
import { db } from "~/server/db";
import { folderRule, folderRuleModes, library, playlist, playlistFolder } from "~/server/db/app-schema";
import { user } from "~/server/db/schema";
import { planRule, syncFolderRules } from "~/server/playlists/folder-rules";
import { assertPlace, FolderError } from "~/server/playlists/folders";
import { adminProcedure, router } from "../../trpc";

const id = z.number().int();
// Inside the library. Leading and trailing slashes don't matter; ".." is not allowed.
const rulePath = z
  .string()
  .trim()
  .max(500)
  .transform((value) => value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""))
  .refine((value) => !value.split("/").includes(".."), "The folder has to be inside the library.");
const mode = z.enum(folderRuleModes);

/** Turns a bad choice of folder to put things in into a message the form can show. */
async function checkPlace(ownerId: string, folderId: number | null) {
  try {
    await assertPlace(ownerId, folderId);
  } catch (error) {
    if (error instanceof FolderError) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
    throw error;
  }
}

const rules = () => {
  const playlists = db
    .select({ ruleId: playlist.ruleId, total: count().as("playlists") })
    .from(playlist)
    .groupBy(playlist.ruleId)
    .as("playlists");
  const folders = db
    .select({ ruleId: playlistFolder.ruleId, total: count().as("folders") })
    .from(playlistFolder)
    .groupBy(playlistFolder.ruleId)
    .as("folders");
  return db
    .select({
      id: folderRule.id,
      libraryId: folderRule.libraryId,
      libraryName: library.name,
      libraryPath: library.path,
      path: folderRule.path,
      mode: folderRule.mode,
      isPublic: folderRule.isPublic,
      ownerId: folderRule.ownerId,
      ownerName: sql<string>`coalesce(${user.username}, ${user.name})`,
      parentFolderId: folderRule.parentFolderId,
      createdAt: folderRule.createdAt,
      playlistCount: sql<number>`coalesce(${playlists.total}, 0)::int`,
      folderCount: sql<number>`coalesce(${folders.total}, 0)::int`,
    })
    .from(folderRule)
    .innerJoin(library, eq(library.id, folderRule.libraryId))
    .innerJoin(user, eq(user.id, folderRule.ownerId))
    .leftJoin(playlists, eq(playlists.ruleId, folderRule.id))
    .leftJoin(folders, eq(folders.ruleId, folderRule.id));
};

export const folderRulesRouter = router({
  list: adminProcedure
    .input(z.object({ libraryId: id.optional() }).optional())
    .query(({ input }) =>
      rules()
        .where(input?.libraryId === undefined ? undefined : eq(folderRule.libraryId, input.libraryId))
        .orderBy(library.name, folderRule.path),
    ),

  /** One rule. `isMine` says whether the admin asking owns it: only its owner's folders can hold what it makes. */
  byId: adminProcedure.input(z.object({ id })).query(async ({ ctx, input }) => {
    const [found] = await rules().where(eq(folderRule.id, input.id));
    if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Rule not found." });
    return { ...found, isMine: found.ownerId === ctx.actor.id };
  }),

  /**
   * What a rule on this folder would make, before it is saved. Counts are for
   * everything; the lists stop at a size a page can show.
   */
  preview: adminProcedure.input(z.object({ libraryId: id, path: rulePath, mode })).query(async ({ input }) => {
    const plan = await planRule(input);
    const shown = 400;
    return {
      folderCount: plan.folders.length,
      playlistCount: plan.playlists.length,
      trackCount: plan.playlists.reduce((sum, item) => sum + item.trackIds.length, 0),
      folders: plan.folders.slice(0, shown),
      playlists: plan.playlists.slice(0, shown).map(({ trackIds, ...item }) => ({ ...item, trackCount: trackIds.length })),
    };
  }),

  /** Adds a rule and builds what it stands for straight away from what is already scanned. */
  create: adminProcedure
    .input(z.object({ libraryId: id, path: rulePath, mode, isPublic: z.boolean(), parentFolderId: id.nullable().default(null) }))
    .mutation(async ({ ctx, input }) => {
      const [lib] = await db.select().from(library).where(eq(library.id, input.libraryId));
      if (!lib) throw new TRPCError({ code: "NOT_FOUND", message: "Library not found." });
      const folder = await stat(path.join(lib.path, input.path)).catch(() => null);
      if (!folder?.isDirectory()) throw new TRPCError({ code: "BAD_REQUEST", message: "There is no folder at that path in the library." });
      await checkPlace(ctx.scope.user.id, input.parentFolderId);

      const [created] = await db
        .insert(folderRule)
        .values({ ...input, ownerId: ctx.scope.user.id })
        .returning({ id: folderRule.id });
      await syncFolderRules(lib.id, created!.id);
      await recordActivity({
        action: "folder_rule.created",
        actor: ctx.actor,
        target: `${lib.name}/${input.path}`,
        detail: { mode: input.mode },
        headers: ctx.headers,
      });
      return created!;
    }),

  /** Changes how a rule builds, who sees the result, or where it sits, then rebuilds. The folder it follows is fixed. */
  update: adminProcedure
    .input(z.object({ id, mode: mode.optional(), isPublic: z.boolean().optional(), parentFolderId: id.nullable().optional() }))
    .mutation(async ({ ctx, input: { id: ruleId, ...change } }) => {
      const [found] = await rules().where(eq(folderRule.id, ruleId));
      if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Rule not found." });
      if (change.parentFolderId !== undefined) await checkPlace(found.ownerId, change.parentFolderId);
      await db.update(folderRule).set(change).where(eq(folderRule.id, ruleId));
      await syncFolderRules(found.libraryId, ruleId);
      await recordActivity({
        action: "folder_rule.updated",
        actor: ctx.actor,
        target: `${found.libraryName}/${found.path}`,
        detail: change,
        headers: ctx.headers,
      });
    }),

  /** Rebuilds a rule from what is scanned now, without waiting for the next scan. */
  sync: adminProcedure.input(z.object({ id })).mutation(async ({ input }) => {
    const [found] = await db.select().from(folderRule).where(eq(folderRule.id, input.id));
    if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Rule not found." });
    await syncFolderRules(found.libraryId, found.id);
  }),

  /** Removes a rule along with the folders and playlists it made. */
  delete: adminProcedure.input(z.object({ id })).mutation(async ({ ctx, input }) => {
    const removed = await db.transaction(async (tx) => {
      await tx.delete(playlist).where(eq(playlist.ruleId, input.id));
      // Its folders go with it, through the foreign key.
      const [rule] = await tx.delete(folderRule).where(eq(folderRule.id, input.id)).returning();
      return rule;
    });
    if (!removed) throw new TRPCError({ code: "NOT_FOUND", message: "Rule not found." });
    await recordActivity({ action: "folder_rule.deleted", actor: ctx.actor, target: removed.path || "/", headers: ctx.headers });
  }),
});
