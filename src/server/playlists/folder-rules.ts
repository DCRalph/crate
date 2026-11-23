import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "~/server/db";
import { folderRule, library, playlist, playlistFolder, playlistTrack, track, type FolderRuleMode } from "~/server/db/app-schema";
import { openLibrarySource } from "~/server/storage";
import { planTree, type TreePlan } from "./plan-tree";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Rule = typeof folderRule.$inferSelect;

/** Replaces a playlist's tracks with `trackIds`, in order. */
export async function setPlaylistTracks(tx: Tx, playlistId: number, trackIds: number[]) {
  await tx.delete(playlistTrack).where(eq(playlistTrack.playlistId, playlistId));
  for (let i = 0; i < trackIds.length; i += 1000) {
    await tx
      .insert(playlistTrack)
      .values(trackIds.slice(i, i + 1000).map((trackId, offset) => ({ playlistId, trackId, position: i + offset })));
  }
  await tx.update(playlist).set({ updatedAt: new Date() }).where(eq(playlist.id, playlistId));
}

/**
 * What a rule on this folder would make right now, from what is already
 * scanned and, in `tree` mode, the playlist files in the library. Also the
 * preview shown before one is saved.
 */
export async function planRule(rule: { libraryId: number; path: string; mode: FolderRuleMode }): Promise<TreePlan> {
  const [lib] = await db
    .select({
      id: library.id,
      name: library.name,
      path: library.path,
      sourceType: library.sourceType,
      sourceConfig: library.sourceConfig,
    })
    .from(library)
    .where(eq(library.id, rule.libraryId));
  if (!lib) return { folders: [], playlists: [] };
  const source = openLibrarySource(lib);
  const playlistFiles = rule.mode === "tree" ? await source.listPlaylistFiles(rule.path) : [];
  const prefix = rule.path ? `${rule.path}/` : "";
  const tracks = await db
    .select({ id: track.id, relPath: track.relPath })
    .from(track)
    // A playlist file can list any track in the library, so with one to read every track is a candidate.
    .where(and(eq(track.libraryId, rule.libraryId), playlistFiles.length ? undefined : sql`starts_with(${track.relPath}, ${prefix})`));
  return planTree(tracks, { path: rule.path, mode: rule.mode, libraryName: lib.name }, playlistFiles);
}

/**
 * Makes a library's folder rules (or just one rule) match the disk: folders
 * and playlists are created, renamed, moved, refilled and removed until they
 * are what `planTree` describes. Each keeps its id for as long as its folder
 * (or, for one of several playlist files in a folder, its file) stays where
 * it is. Runs after every scan and whenever a rule changes.
 */
export async function syncFolderRules(libraryId: number, ruleId?: number) {
  const rules = await db
    .select()
    .from(folderRule)
    .where(and(eq(folderRule.libraryId, libraryId), ruleId ? eq(folderRule.id, ruleId) : undefined));
  for (const rule of rules) {
    const plan = await planRule(rule);
    await db.transaction((tx) => applyPlan(tx, rule, plan));
  }
}

async function applyPlan(tx: Tx, rule: Rule, plan: TreePlan) {
  // Folders come parents first, so each can point at its parent's row.
  const oldFolders = new Map(
    (await tx.select().from(playlistFolder).where(eq(playlistFolder.ruleId, rule.id))).map((row) => [row.sourcePath ?? "", row]),
  );
  const folderIds = new Map<string, number>();
  const placeOf = (path: string | null) => (path === null ? rule.parentFolderId : folderIds.get(path)!);

  for (const folder of plan.folders) {
    const parentId = placeOf(folder.parentPath);
    const current = oldFolders.get(folder.sourcePath);
    if (!current) {
      const [created] = await tx
        .insert(playlistFolder)
        .values({ name: folder.name, ownerId: rule.ownerId, parentId, ruleId: rule.id, sourcePath: folder.sourcePath })
        .returning({ id: playlistFolder.id });
      folderIds.set(folder.sourcePath, created!.id);
      continue;
    }
    folderIds.set(folder.sourcePath, current.id);
    if (current.name !== folder.name || current.parentId !== parentId) {
      await tx.update(playlistFolder).set({ name: folder.name, parentId, updatedAt: new Date() }).where(eq(playlistFolder.id, current.id));
    }
  }

  const oldPlaylists = new Map(
    (await tx.select().from(playlist).where(eq(playlist.ruleId, rule.id))).map((row) => [row.sourcePath ?? "", row]),
  );
  const oldTracks = new Map<number, number[]>();
  const rows = await tx
    .select({ playlistId: playlistTrack.playlistId, trackId: playlistTrack.trackId })
    .from(playlistTrack)
    .innerJoin(playlist, eq(playlist.id, playlistTrack.playlistId))
    .where(eq(playlist.ruleId, rule.id))
    .orderBy(asc(playlistTrack.playlistId), asc(playlistTrack.position));
  for (const row of rows) oldTracks.set(row.playlistId, [...(oldTracks.get(row.playlistId) ?? []), row.trackId]);

  for (const item of plan.playlists) {
    const details = { name: item.name, folderId: placeOf(item.folderPath), isPublic: rule.isPublic };
    const current = oldPlaylists.get(item.sourcePath);
    if (!current) {
      const [created] = await tx
        .insert(playlist)
        .values({ ...details, ownerId: rule.ownerId, ruleId: rule.id, sourcePath: item.sourcePath, readOnly: true })
        .returning({ id: playlist.id });
      await setPlaylistTracks(tx, created!.id, item.trackIds);
      continue;
    }
    if (current.name !== details.name || current.folderId !== details.folderId || current.isPublic !== details.isPublic) {
      await tx.update(playlist).set(details).where(eq(playlist.id, current.id));
    }
    const now = oldTracks.get(current.id) ?? [];
    const same = now.length === item.trackIds.length && now.every((trackId, i) => trackId === item.trackIds[i]);
    if (!same) await setPlaylistTracks(tx, current.id, item.trackIds);
  }

  // Whatever no longer has a folder or playlist file on disk goes. Playlists first: removing a folder takes the folders inside it too.
  const keptPlaylists = new Set(plan.playlists.map((item) => item.sourcePath));
  const gonePlaylists = [...oldPlaylists].filter(([path]) => !keptPlaylists.has(path)).map(([, row]) => row.id);
  if (gonePlaylists.length) await tx.delete(playlist).where(inArray(playlist.id, gonePlaylists));
  const goneFolders = [...oldFolders].filter(([path]) => !folderIds.has(path)).map(([, row]) => row.id);
  if (goneFolders.length) await tx.delete(playlistFolder).where(inArray(playlistFolder.id, goneFolders));
}
