import "server-only";
import { asc, eq, sql } from "drizzle-orm";

import { seenBy } from "~/lib/audience";
import type { Scope } from "~/server/access";
import { db } from "~/server/db";
import { folderRule, playlist, playlistFolder } from "~/server/db/app-schema";
import { user } from "~/server/db/schema";
import { listPlaylists, loadAudiences } from "~/server/library/queries";

// The folders people sort their playlists into. Folders hold folders and
// playlists; a playlist is always a leaf.

/** Thrown when a folder isn't there, follows the disk, or a move makes no sense. */
export class FolderError extends Error {
  constructor(
    public reason: "not_found" | "read_only" | "invalid",
    message = reason === "not_found" ? "Folder not found." : reason === "read_only" ? "This folder follows the disk, so it can't be changed here." : "That won't work.",
  ) {
    super(message);
  }
}

export type FolderRow = Awaited<ReturnType<typeof allFolders>>[number];

const allFolders = () =>
  db
    .select({
      id: playlistFolder.id,
      name: playlistFolder.name,
      parentId: playlistFolder.parentId,
      ownerId: playlistFolder.ownerId,
      ownerName: sql<string>`coalesce(${user.username}, ${user.name})`,
      ruleId: playlistFolder.ruleId,
      sourcePath: playlistFolder.sourcePath,
    })
    .from(playlistFolder)
    .innerJoin(user, eq(user.id, playlistFolder.ownerId))
    .orderBy(asc(sql`lower(${playlistFolder.name})`));

/**
 * The playlist tree as a scope sees it: every playlist it can see, its own
 * folders, and other people's folders only where they lead to a playlist it
 * can see. Admins see every folder. Each folder says who can listen to it.
 */
export async function getPlaylistTree(scope: Scope) {
  const [audiences, folders] = await Promise.all([loadAudiences(), allFolders()]);
  const playlists = await listPlaylists(scope, undefined, audiences);
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const leading = new Set<number>();
  for (const item of playlists) {
    for (let id = item.folderId; id !== null && !leading.has(id); id = byId.get(id)?.parentId ?? null) leading.add(id);
  }
  return {
    playlists,
    folders: folders
      .filter((folder) => scope.isAdmin || folder.ownerId === scope.user.id || leading.has(folder.id))
      .map((folder) => {
        const audience = audiences.folder(folder.id);
        return { ...folder, audience: scope.isAdmin || folder.ownerId === scope.user.id ? audience : seenBy(audience, scope.user.id) };
      }),
  };
}

/** Each folder's place in the tree as text, "Mixes / 2025", for lists that can't nest. */
export function folderPaths(folders: { id: number; name: string; parentId: number | null }[]) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const paths = new Map<number, string>();
  const pathOf = (id: number): string => {
    const known = paths.get(id);
    if (known !== undefined) return known;
    const folder = byId.get(id);
    if (!folder) return "";
    const above = folder.parentId === null ? "" : pathOf(folder.parentId);
    const path = above ? `${above} / ${folder.name}` : folder.name;
    paths.set(id, path);
    return path;
  };
  for (const folder of folders) pathOf(folder.id);
  return paths;
}

async function findFolder(id: number) {
  const [found] = await db.select().from(playlistFolder).where(eq(playlistFolder.id, id));
  if (!found) throw new FolderError("not_found");
  return found;
}

/** A folder this scope may rename, move or remove: its own (or anyone's for an admin), and not one a rule made. */
async function editable(scope: Scope, id: number) {
  const found = await findFolder(id);
  if (found.ownerId !== scope.user.id && !scope.isAdmin) throw new FolderError("not_found");
  if (found.ruleId !== null) throw new FolderError("read_only");
  return found;
}

/**
 * Checks that `folderId` is somewhere `ownerId` can put things: the top level
 * (null), or one of their own folders that doesn't follow the disk.
 */
export async function assertPlace(ownerId: string, folderId: number | null) {
  if (folderId === null) return;
  const [target] = await db.select().from(playlistFolder).where(eq(playlistFolder.id, folderId));
  if (!target || target.ownerId !== ownerId) throw new FolderError("invalid", "Pick one of your own folders.");
  if (target.ruleId !== null) throw new FolderError("invalid", "That folder follows the disk, so nothing can be put in it.");
}

export async function createFolder(scope: Scope, input: { name: string; parentId: number | null }) {
  await assertPlace(scope.user.id, input.parentId);
  const [created] = await db
    .insert(playlistFolder)
    .values({ name: input.name, ownerId: scope.user.id, parentId: input.parentId })
    .returning({ id: playlistFolder.id });
  return created!.id;
}

/** Renames a folder or moves it. A folder can't go inside itself or anything it holds. */
export async function updateFolder(scope: Scope, id: number, change: { name?: string; parentId?: number | null }) {
  const found = await editable(scope, id);
  if (change.parentId !== undefined && change.parentId !== found.parentId) {
    await assertPlace(found.ownerId, change.parentId);
    for (let at = change.parentId; at !== null; at = (await findFolder(at)).parentId) {
      if (at === id) throw new FolderError("invalid", "A folder can't go inside itself.");
    }
  }
  await db
    .update(playlistFolder)
    .set({ name: change.name, parentId: change.parentId, updatedAt: new Date() })
    .where(eq(playlistFolder.id, id));
}

/** Removes a folder. What was in it moves up to where the folder was; nothing inside is deleted. */
export async function deleteFolder(scope: Scope, id: number) {
  const found = await editable(scope, id);
  await db.transaction(async (tx) => {
    await tx.update(playlistFolder).set({ parentId: found.parentId }).where(eq(playlistFolder.parentId, id));
    await tx.update(playlist).set({ folderId: found.parentId }).where(eq(playlist.folderId, id));
    await tx.update(folderRule).set({ parentFolderId: found.parentId }).where(eq(folderRule.parentFolderId, id));
    await tx.delete(playlistFolder).where(eq(playlistFolder.id, id));
  });
}

const everyFolderPath = async () =>
  folderPaths(await db.select({ id: playlistFolder.id, name: playlistFolder.name, parentId: playlistFolder.parentId }).from(playlistFolder));

/**
 * For lists that can't nest (the Subsonic API): gives each playlist that sits
 * in a folder its folders as part of its name, "Mixes / 2025 / Summer".
 */
export async function namedByFolder<T extends { name: string; folderId: number | null }>(rows: T[]): Promise<T[]> {
  if (rows.every((row) => row.folderId === null)) return rows;
  const paths = await everyFolderPath();
  return rows.map((row) => {
    const folder = row.folderId === null ? undefined : paths.get(row.folderId);
    return folder ? { ...row, name: `${folder} / ${row.name}` } : row;
  });
}

/** The reverse of `namedByFolder`, for a rename that comes back with the folders still in the name. */
export async function withoutFolderName(playlistId: number, name: string) {
  const [row] = await db.select({ folderId: playlist.folderId }).from(playlist).where(eq(playlist.id, playlistId));
  if (!row || row.folderId === null) return name;
  const prefix = `${(await everyFolderPath()).get(row.folderId) ?? ""} / `;
  return name.startsWith(prefix) ? name.slice(prefix.length).trim() || name : name;
}
