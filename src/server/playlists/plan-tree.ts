import type { FolderRuleMode } from "~/server/db/app-schema";
import { playlistFilePattern, trackFinder, type PlaylistFile } from "./playlist-file";

/** A folder a rule should make. `sourcePath` is the disk folder it stands for, and its identity across rescans. */
export type PlannedFolder = { sourcePath: string; name: string; parentPath: string | null };
/**
 * A playlist a rule should make, and the planned folder it sits in (null for
 * the top of what the rule makes). `sourcePath` is the disk folder it stands
 * for, or the playlist file when a folder has several. `playlistFile` is set
 * when the tracks and their order come from a playlist file, with how many of
 * the file's entries matched no scanned track.
 */
export type PlannedPlaylist = {
  sourcePath: string;
  name: string;
  folderPath: string | null;
  trackIds: number[];
  playlistFile?: { relPath: string; missing: number };
};
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
 *
 * In `tree` mode the `.m3u` and `.m3u8` files under the rule's folder are
 * used too. A folder with one playlist file takes its tracks and their order
 * from it: the playlist keeps the folder's name and place, and tracks in the
 * folder that the file leaves out follow in path order. A folder with several
 * gets a playlist for each, named after the file, beside the folder's own. An
 * entry can be any track in `tracks`, so pass the whole library when there
 * are playlist files. Entries that match no track are skipped, and a file
 * that matches none is ignored.
 */
export function planTree(
  tracks: { id: number; relPath: string }[],
  rule: { path: string; mode: FolderRuleMode; libraryName: string },
  playlistFiles: PlaylistFile[] = [],
): TreePlan {
  const base = rule.path.replace(/^\/+|\/+$/g, "");
  const prefix = base ? `${base}/` : "";
  const nameOf = (dir: string) => (dir === base ? (base.split("/").at(-1) ?? "") || rule.libraryName : dir.split("/").at(-1)!);
  const inOrder = (items: { id: number; relPath: string }[]) =>
    [...items].sort((a, b) => byPath.compare(a.relPath, b.relPath)).map((item) => item.id);

  const inside = tracks.filter((item) => item.relPath.startsWith(prefix));

  if (rule.mode === "folder") {
    if (!inside.length) return { folders: [], playlists: [] };
    return { folders: [], playlists: [{ sourcePath: base, name: nameOf(base), folderPath: null, trackIds: inOrder(inside) }] };
  }

  // The playlist files in each folder, with the scanned tracks each one lists.
  const find = trackFinder(tracks);
  const lists = new Map<string, { relPath: string; trackIds: number[]; missing: number }[]>();
  for (const file of [...playlistFiles].sort((a, b) => byPath.compare(a.relPath, b.relPath))) {
    const dir = parentOf(file.relPath);
    if (dir !== base && !dir.startsWith(prefix)) continue;
    const trackIds = file.entries.flatMap((entry) => find(entry) ?? []);
    if (!trackIds.length) continue;
    lists.set(dir, [...(lists.get(dir) ?? []), { relPath: file.relPath, trackIds, missing: file.entries.length - trackIds.length }]);
  }

  // The tracks sitting directly in each folder.
  const direct = new Map<string, { id: number; relPath: string }[]>();
  for (const item of inside) {
    const dir = parentOf(item.relPath);
    direct.set(dir, [...(direct.get(dir) ?? []), item]);
  }
  if (!direct.size && !lists.size) return { folders: [], playlists: [] };
  // Every folder from the rule's own down to each one holding tracks or a playlist file, and which of them hold other folders.
  const dirs = new Set<string>([base]);
  const branches = new Set<string>();
  for (const leaf of [...direct.keys(), ...lists.keys()]) {
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
    const own = inOrder(direct.get(dir) ?? []);
    const files = lists.get(dir) ?? [];
    // A folder that holds folders is a folder, and its own playlists go inside it. Otherwise they stand in its place.
    const folderPath = branches.has(dir) ? dir : parentPath;
    if (branches.has(dir)) plan.folders.push({ sourcePath: dir, name: nameOf(dir), parentPath });

    const [only] = files.length === 1 ? files : [];
    if (only) {
      const { trackIds, ...playlistFile } = only;
      const listed = new Set(trackIds);
      const unlisted = own.filter((id) => !listed.has(id));
      plan.playlists.push({ sourcePath: dir, name: nameOf(dir), folderPath, trackIds: [...trackIds, ...unlisted], playlistFile });
      continue;
    }
    if (own.length) plan.playlists.push({ sourcePath: dir, name: nameOf(dir), folderPath, trackIds: own });
    for (const { trackIds, ...playlistFile } of files) {
      const name = playlistFile.relPath.split("/").at(-1)!.replace(playlistFilePattern, "");
      plan.playlists.push({ sourcePath: playlistFile.relPath, name, folderPath, trackIds, playlistFile });
    }
  }
  return plan;
}
