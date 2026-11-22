import type { FolderRuleMode } from "~/server/db/app-schema";

/** A folder a rule should make. `sourcePath` is the disk folder it stands for, and its identity across rescans. */
export type PlannedFolder = { sourcePath: string; name: string; parentPath: string | null };
/** A playlist a rule should make, and the planned folder it sits in (null for the top of what the rule makes). */
export type PlannedPlaylist = { sourcePath: string; name: string; folderPath: string | null; trackIds: number[] };
export type TreePlan = { folders: PlannedFolder[]; playlists: PlannedPlaylist[] };

const byPath = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
const parentOf = (dir: string) => (dir.includes("/") ? dir.slice(0, dir.lastIndexOf("/")) : "");

/**
 * Works out the folders and playlists a folder rule stands for, from the
 * library's tracks.
 *
 * In `tree` mode the result matches the disk: a folder that holds other
 * folders becomes a folder, a folder that holds tracks becomes a playlist, and
 * a folder that holds both becomes a folder with a playlist of the same name
 * inside it for the loose tracks. In `folder` mode everything under the
 * rule's folder is one playlist.
 *
 * Tracks are ordered by path with numbers compared as numbers, so
 * "2 - b.mp3" comes before "10 - a.mp3". Folders come out parents first.
 */
export function planTree(
  tracks: { id: number; relPath: string }[],
  rule: { path: string; mode: FolderRuleMode; libraryName: string },
): TreePlan {
  const base = rule.path.replace(/^\/+|\/+$/g, "");
  const prefix = base ? `${base}/` : "";
  const nameOf = (dir: string) => (dir === base ? (base.split("/").at(-1) ?? "") || rule.libraryName : dir.split("/").at(-1)!);
  const inOrder = (items: { id: number; relPath: string }[]) =>
    [...items].sort((a, b) => byPath.compare(a.relPath, b.relPath)).map((item) => item.id);

  const inside = tracks.filter((item) => item.relPath.startsWith(prefix));
  if (!inside.length) return { folders: [], playlists: [] };

  if (rule.mode === "folder") {
    return { folders: [], playlists: [{ sourcePath: base, name: nameOf(base), folderPath: null, trackIds: inOrder(inside) }] };
  }

  // The tracks sitting directly in each folder.
  const direct = new Map<string, { id: number; relPath: string }[]>();
  for (const item of inside) {
    const dir = parentOf(item.relPath);
    direct.set(dir, [...(direct.get(dir) ?? []), item]);
  }
  // Every folder from the rule's own down to each one holding tracks, and which of them hold other folders.
  const dirs = new Set<string>([base]);
  const branches = new Set<string>();
  for (const leaf of direct.keys()) {
    for (let dir = leaf; dir !== base; dir = parentOf(dir)) {
      dirs.add(dir);
      branches.add(parentOf(dir));
    }
  }

  const depth = (dir: string) => (dir ? dir.split("/").length : 0);
  const ordered = [...dirs].sort((a, b) => depth(a) - depth(b) || byPath.compare(a, b));
  const plan: TreePlan = { folders: [], playlists: [] };
  for (const dir of ordered) {
    const parentPath = dir === base ? null : parentOf(dir);
    const own = direct.get(dir);
    if (branches.has(dir)) {
      plan.folders.push({ sourcePath: dir, name: nameOf(dir), parentPath });
      if (own) plan.playlists.push({ sourcePath: dir, name: nameOf(dir), folderPath: dir, trackIds: inOrder(own) });
    } else if (own) {
      plan.playlists.push({ sourcePath: dir, name: nameOf(dir), folderPath: parentPath, trackIds: inOrder(own) });
    }
  }
  return plan;
}
