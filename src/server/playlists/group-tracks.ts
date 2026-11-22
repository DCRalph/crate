import type { folderRuleModes } from "~/server/db/app-schema";

export type FolderGroup = {
  /** The folder this playlist stands for, relative to the library. Its identity across rescans. */
  sourcePath: string;
  name: string;
  trackIds: number[];
};

const byPath = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/**
 * Splits a library's tracks into the playlists a folder rule describes.
 * Tracks are ordered by path with numbers compared as numbers, so
 * "2 - b.mp3" comes before "10 - a.mp3".
 */
export function groupTracks(
  tracks: { id: number; relPath: string }[],
  rule: { path: string; mode: (typeof folderRuleModes)[number]; libraryName: string },
): FolderGroup[] {
  const base = rule.path.replace(/^\/+|\/+$/g, "");
  const prefix = base ? `${base}/` : "";
  const baseName = base ? base.split("/").at(-1)! : rule.libraryName;
  const groups = new Map<string, FolderGroup & { paths: Map<number, string> }>();

  const add = (sourcePath: string, name: string, item: { id: number; relPath: string }) => {
    let group = groups.get(sourcePath);
    if (!group) groups.set(sourcePath, (group = { sourcePath, name, trackIds: [], paths: new Map() }));
    group.paths.set(item.id, item.relPath);
  };

  for (const item of tracks) {
    if (!item.relPath.startsWith(prefix)) continue;
    const folders = item.relPath.slice(prefix.length).split("/").slice(0, -1);

    if (rule.mode === "folder") {
      add(base, baseName, item);
    } else if (rule.mode === "subfolders") {
      // Files sitting directly in the folder belong to no subfolder.
      if (folders.length) add(prefix + folders[0]!, folders[0]!, item);
    } else {
      add(prefix + folders.join("/"), folders.length ? folders.join(" / ") : baseName, item);
    }
  }

  return [...groups.values()]
    .map(({ paths, ...group }) => ({
      ...group,
      sourcePath: group.sourcePath.replace(/\/$/, ""),
      trackIds: [...paths].sort((a, b) => byPath.compare(a[1], b[1])).map(([id]) => id),
    }))
    .sort((a, b) => byPath.compare(a.sourcePath, b.sourcePath));
}
