import { describe, expect, test } from "bun:test";

import { planTree } from "./plan-tree";

const tracks = [
  "Mixes/loose.mp3",
  "Mixes/2025/Summer/10 - z.mp3",
  "Mixes/2025/Summer/2 - a.mp3",
  "Mixes/2025/Winter/a.mp3",
  "Mixes/2026/Autumn/a.mp3",
  "Mixes2/other.mp3",
  "Albums/One/a.mp3",
].map((relPath, index) => ({ id: index + 1, relPath }));

describe("planTree", () => {
  test("tree mode matches the folders on disk, with playlists as the leaves", () => {
    const plan = planTree(tracks, { path: "Mixes", mode: "tree", libraryName: "Main" });
    expect(plan.folders).toEqual([
      { sourcePath: "Mixes", name: "Mixes", parentPath: null },
      { sourcePath: "Mixes/2025", name: "2025", parentPath: "Mixes" },
      { sourcePath: "Mixes/2026", name: "2026", parentPath: "Mixes" },
    ]);
    expect(plan.playlists).toEqual([
      // Tracks sitting beside subfolders get a playlist of their own inside the folder.
      { sourcePath: "Mixes", name: "Mixes", folderPath: "Mixes", trackIds: [1] },
      // Numbers in file names sort as numbers.
      { sourcePath: "Mixes/2025/Summer", name: "Summer", folderPath: "Mixes/2025", trackIds: [3, 2] },
      { sourcePath: "Mixes/2025/Winter", name: "Winter", folderPath: "Mixes/2025", trackIds: [4] },
      { sourcePath: "Mixes/2026/Autumn", name: "Autumn", folderPath: "Mixes/2026", trackIds: [5] },
    ]);
  });

  test("a folder holding only tracks is a single playlist with no folder", () => {
    const plan = planTree(tracks, { path: "/Mixes/2025/Summer/", mode: "tree", libraryName: "Main" });
    expect(plan).toEqual({
      folders: [],
      playlists: [{ sourcePath: "Mixes/2025/Summer", name: "Summer", folderPath: null, trackIds: [3, 2] }],
    });
  });

  test("the library root is named after the library", () => {
    const plan = planTree(tracks, { path: "", mode: "tree", libraryName: "Main" });
    expect(plan.folders[0]).toEqual({ sourcePath: "", name: "Main", parentPath: null });
    expect(plan.folders.map((folder) => folder.sourcePath)).toEqual(["", "Albums", "Mixes", "Mixes/2025", "Mixes/2026"]);
    expect(plan.playlists.find((playlist) => playlist.sourcePath === "Mixes2")?.folderPath).toBe("");
  });

  test("folder mode makes one playlist of everything underneath", () => {
    const plan = planTree(tracks, { path: "Mixes", mode: "folder", libraryName: "Main" });
    expect(plan).toEqual({
      folders: [],
      playlists: [{ sourcePath: "Mixes", name: "Mixes", folderPath: null, trackIds: [3, 2, 4, 5, 1] }],
    });
  });

  test("a folder with no tracks plans nothing", () => {
    expect(planTree(tracks, { path: "Gone", mode: "tree", libraryName: "Main" })).toEqual({ folders: [], playlists: [] });
  });
});
