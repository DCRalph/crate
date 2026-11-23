import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { TRPCError } from "@trpc/server";
import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { recordActivity } from "~/server/activity";
import { db } from "~/server/db";
import { album, folderRule, library, libraryAccess, playlist, track } from "~/server/db/app-schema";
import { user } from "~/server/db/schema";
import { removeUnusedArtists, scanProgress, startScan } from "~/server/library/scanner";
import { adminProcedure, router } from "../../trpc";

const id = z.number().int();
const name = z.string().trim().min(1, "Give it a name.").max(60);
const folderPath = z.string().trim().min(1, "Enter the folder's path.");

/** True when one path is the other, or sits inside it. */
const overlaps = (a: string, b: string) => {
  const inside = (child: string, parent: string) => child === parent || child.startsWith(parent + path.sep);
  return inside(a, b) || inside(b, a);
};

/**
 * Checks a folder can hold a library: a full path, a real folder, and not
 * inside (or around) another library, since a file in two libraries would have
 * two owners and access is per library. Returns the path tidied up.
 */
async function usableFolder(input: string, exceptLibraryId?: number) {
  if (!path.isAbsolute(input)) throw new TRPCError({ code: "BAD_REQUEST", message: "Use a full path, starting with /." });
  const folder = path.resolve(input);
  const info = await stat(folder).catch(() => null);
  if (!info?.isDirectory()) throw new TRPCError({ code: "BAD_REQUEST", message: "The server can't find a folder at that path." });
  const others = await db
    .select()
    .from(library)
    .where(exceptLibraryId === undefined ? undefined : ne(library.id, exceptLibraryId));
  const clash = others.find((other) => overlaps(folder, other.path));
  if (clash) throw new TRPCError({ code: "CONFLICT", message: `That folder overlaps the ${clash.name} library.` });
  return folder;
}

async function findLibrary(libraryId: number) {
  const [found] = await db.select().from(library).where(eq(library.id, libraryId));
  if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Library not found." });
  return found;
}

const counts = () => {
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
  return db
    .select({
      id: library.id,
      name: library.name,
      path: library.path,
      createdAt: library.createdAt,
      lastScanAt: library.lastScanAt,
      lastScan: library.lastScan,
      trackCount: sql<number>`coalesce(${tracks.total}, 0)::int`,
      albumCount: sql<number>`coalesce(${albums.total}, 0)::int`,
      userCount: sql<number>`coalesce(${people.total}, 0)::int`,
    })
    .from(library)
    .leftJoin(tracks, eq(tracks.libraryId, library.id))
    .leftJoin(albums, eq(albums.libraryId, library.id))
    .leftJoin(people, eq(people.libraryId, library.id));
};

export const librariesRouter = router({
  /** Every library with its counts, and the scan that is running, if one is. */
  list: adminProcedure.query(async () => ({ libraries: await counts().orderBy(library.name), scan: scanProgress() })),

  /** Just the names, for pickers. */
  options: adminProcedure.query(() => db.select({ id: library.id, name: library.name, path: library.path }).from(library).orderBy(library.name)),

  /** One library: its counts, everyone with what they can do in it, and the scan that is running, if one is. */
  byId: adminProcedure.input(z.object({ id })).query(async ({ input }) => {
    const [found] = await counts().where(eq(library.id, input.id));
    if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Library not found." });
    const [access, ruleCount] = await Promise.all([
      db
        .select({
          userId: user.id,
          username: sql<string>`coalesce(${user.username}, ${user.name})`,
          name: user.name,
          isAdmin: sql<boolean>`${user.role} = 'admin'`,
          granted: sql<boolean>`${libraryAccess.userId} is not null`,
          canDownload: sql<boolean>`coalesce(${libraryAccess.canDownload}, false)`,
        })
        .from(user)
        .leftJoin(libraryAccess, and(eq(libraryAccess.userId, user.id), eq(libraryAccess.libraryId, input.id)))
        .orderBy(asc(sql`lower(coalesce(${user.username}, ${user.name}))`)),
      db.$count(folderRule, eq(folderRule.libraryId, input.id)),
    ]);
    return { ...found, access, ruleCount, scan: scanProgress() };
  }),

  /** Folders at a path on the server, for picking a library's folder. Hidden folders are left out. */
  browse: adminProcedure.input(z.object({ path: z.string().default("/") })).query(async ({ input }) => {
    const here = path.resolve(path.isAbsolute(input.path) ? input.path : "/");
    const entries = await readdir(here, { withFileTypes: true }).catch(() => null);
    if (!entries) throw new TRPCError({ code: "BAD_REQUEST", message: "The server can't open that folder." });
    const sorter = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
    return {
      path: here,
      parent: here === path.parse(here).root ? null : path.dirname(here),
      folders: entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map((entry) => ({ name: entry.name, path: path.join(here, entry.name) }))
        .sort((a, b) => sorter.compare(a.name, b.name)),
    };
  }),

  /**
   * The folders inside a library that hold music, from what is already
   * scanned, each with the tracks directly in it. Paths are relative to the
   * library, "" being the library's own folder.
   */
  folders: adminProcedure.input(z.object({ id })).query(async ({ input }) => {
    const dir = sql<string>`case when position('/' in ${track.relPath}) = 0 then '' else regexp_replace(${track.relPath}, '/[^/]*$', '') end`;
    const rows = await db
      .select({ path: dir, tracks: count() })
      .from(track)
      .where(eq(track.libraryId, input.id))
      .groupBy(dir);
    // Folders that only hold other folders have no tracks of their own, so they are added here.
    const folders = new Map(rows.map((row) => [row.path, row.tracks]));
    for (const row of rows) {
      for (let at = row.path; at.includes("/"); ) {
        at = at.slice(0, at.lastIndexOf("/"));
        if (!folders.has(at)) folders.set(at, 0);
      }
    }
    if (rows.length && !folders.has("")) folders.set("", 0);
    const sorter = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
    return [...folders].map(([folder, tracks]) => ({ path: folder, tracks })).sort((a, b) => sorter.compare(a.path, b.path));
  }),

  create: adminProcedure.input(z.object({ name, path: folderPath })).mutation(async ({ ctx, input }) => {
    const folder = await usableFolder(input.path);
    const [created] = await db.insert(library).values({ name: input.name, path: folder }).returning({ id: library.id });
    await recordActivity({ action: "library.created", actor: ctx.actor, target: input.name, detail: { path: folder }, headers: ctx.headers });
    startScan({ libraryIds: [created!.id], actor: ctx.actor });
    return created!;
  }),

  /**
   * Renames a library, or points it at the folder its files have moved to.
   * Tracks keep their ids through a move, so playlists, likes and play counts
   * survive; a scan then picks up anything that differs in the new place.
   * A folder holding none of the library's files is refused: scanning it
   * would remove every track, and their likes and playlist places with them.
   */
  update: adminProcedure.input(z.object({ id, name: name.optional(), path: folderPath.optional() })).mutation(async ({ ctx, input }) => {
    const found = await findLibrary(input.id);
    const folder = input.path === undefined ? found.path : await usableFolder(input.path, input.id);
    const moved = folder !== found.path;
    if (moved && scanProgress()) throw new TRPCError({ code: "CONFLICT", message: "Wait for the scan to finish." });
    if (moved) {
      const sample = await db.select({ path: track.path }).from(track).where(eq(track.libraryId, input.id)).limit(25);
      const there = await Promise.all(sample.map((file) => stat(folder + file.path.slice(found.path.length)).then(() => true, () => false)));
      if (sample.length && !there.includes(true)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "None of this library's files are in that folder. Pick the folder they were moved to, or add it as a new library.",
        });
      }
    }

    await db.transaction(async (tx) => {
      await tx.update(library).set({ name: input.name, path: folder }).where(eq(library.id, input.id));
      if (!moved) return;
      const rest = (column: typeof track.path | typeof album.coverPath) => sql`${folder} || substr(${column}, char_length(${found.path}) + 1)`;
      await tx.update(track).set({ path: rest(track.path) }).where(eq(track.libraryId, input.id));
      await tx.update(album).set({ coverPath: rest(album.coverPath) }).where(eq(album.libraryId, input.id));
    });
    await recordActivity({
      action: "library.updated",
      actor: ctx.actor,
      target: input.name ?? found.name,
      detail: { ...(input.name && input.name !== found.name ? { name: input.name } : {}), ...(moved ? { path: folder, was: found.path } : {}) },
      headers: ctx.headers,
    });
    if (moved) startScan({ libraryIds: [input.id], actor: ctx.actor });
  }),

  /**
   * Removes the library and its tracks from the server, along with the
   * playlists its folder rules made. Left to the database those would only
   * lose their rule and stay behind, empty and read-only. Files on disk are untouched.
   */
  delete: adminProcedure.input(z.object({ id })).mutation(async ({ ctx, input }) => {
    if (scanProgress()) throw new TRPCError({ code: "CONFLICT", message: "Wait for the scan to finish." });
    const removed = await db.transaction(async (tx) => {
      const rules = tx.select({ id: folderRule.id }).from(folderRule).where(eq(folderRule.libraryId, input.id));
      await tx.delete(playlist).where(inArray(playlist.ruleId, rules));
      const [row] = await tx.delete(library).where(eq(library.id, input.id)).returning();
      return row;
    });
    if (!removed) throw new TRPCError({ code: "NOT_FOUND", message: "Library not found." });
    await removeUnusedArtists();
    await recordActivity({ action: "library.deleted", actor: ctx.actor, target: removed.name, detail: { path: removed.path }, headers: ctx.headers });
  }),

  /**
   * Starts a scan of one library, or all of them. `full` reads every file
   * again instead of only new and changed ones. Progress comes back through `list` and `byId`.
   */
  scan: adminProcedure.input(z.object({ id: id.optional(), full: z.boolean().default(false) })).mutation(({ ctx, input }) => {
    const started = startScan({ libraryIds: input.id === undefined ? undefined : [input.id], full: input.full, actor: ctx.actor });
    if (!started) throw new TRPCError({ code: "CONFLICT", message: "A scan is already running." });
  }),
});
