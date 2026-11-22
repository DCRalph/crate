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

describe("planTree with playlist files", () => {
  const rule = { path: "Mixes", mode: "tree" as const, libraryName: "Main" };
  const summer = { relPath: "Mixes/2025/Summer/Summer.m3u8", entries: ["Mixes/2025/Summer/10 - z.mp3", "Mixes/2025/Summer/gone.mp3", "Mixes/2025/Summer/2 - a.mp3"] };
  const playlistAt = (plan: ReturnType<typeof planTree>, sourcePath: string) => plan.playlists.find((playlist) => playlist.sourcePath === sourcePath);

  test("one playlist file in a folder gives that folder's playlist its order, under the folder's name and place", () => {
    const plan = planTree(tracks, rule, [summer]);
    expect(plan.folders).toEqual(planTree(tracks, rule).folders);
    expect(plan.playlists.map((playlist) => playlist.sourcePath)).toEqual(["Mixes", "Mixes/2025/Summer", "Mixes/2025/Winter", "Mixes/2026/Autumn"]);
    expect(playlistAt(plan, "Mixes/2025/Summer")).toEqual({
      sourcePath: "Mixes/2025/Summer",
      name: "Summer",
      folderPath: "Mixes/2025",
      // The file's order, not path order. The entry with no track is skipped and counted.
      trackIds: [2, 3],
      playlistFile: { relPath: "Mixes/2025/Summer/Summer.m3u8", missing: 1 },
    });
  });

  test("tracks in the folder that the file leaves out follow, in path order", () => {
    const more = [...tracks, { id: 8, relPath: "Mixes/2025/Summer/30 - new.mp3" }, { id: 9, relPath: "Mixes/2025/Summer/1 - new.mp3" }];
    expect(playlistAt(planTree(more, rule, [summer]), "Mixes/2025/Summer")?.trackIds).toEqual([2, 3, 9, 8]);
  });

  test("entries match whatever the letter case or the way accents are composed", () => {
    const accented = [...tracks, { id: 8, relPath: "Mixes/2025/Winter/Café.mp3".normalize("NFD") }];
    const winter = { relPath: "Mixes/2025/Winter/w.m3u", entries: ["Mixes/2025/Winter/CAFÉ.mp3".normalize("NFC"), "mixes/2025/winter/A.MP3"] };
    expect(playlistAt(planTree(accented, rule, [winter]), "Mixes/2025/Winter")?.trackIds).toEqual([8, 4]);
  });

  test("a file can list tracks from anywhere in the library, and can stand alone in a folder with no tracks", () => {
    const best = { relPath: "Mixes/Best of/best.m3u8", entries: ["Albums/One/a.mp3", "Mixes/2026/Autumn/a.mp3"] };
    const plan = planTree(tracks, rule, [best]);
    expect(playlistAt(plan, "Mixes/Best of")).toEqual({
      sourcePath: "Mixes/Best of",
      name: "Best of",
      folderPath: "Mixes",
      trackIds: [7, 5],
      playlistFile: { relPath: "Mixes/Best of/best.m3u8", missing: 0 },
    });
    // In a folder that holds folders, the file orders the playlist of loose tracks inside it, and the loose track it leaves out follows.
    const loose = { relPath: "Mixes/order.m3u8", entries: ["Mixes/2025/Winter/a.mp3"] };
    expect(playlistAt(planTree(tracks, rule, [loose]), "Mixes")).toMatchObject({ name: "Mixes", folderPath: "Mixes", trackIds: [4, 1] });
  });

  test("several playlist files in a folder each become a playlist beside the folder's own", () => {
    const warmup = { relPath: "Mixes/2025/Summer/warm up.m3u", entries: ["Mixes/2025/Summer/10 - z.mp3"] };
    const closing = { relPath: "Mixes/2025/Summer/Closing.M3U8", entries: ["Mixes/2025/Winter/a.mp3", "Mixes/2025/Summer/10 - z.mp3"] };
    const plan = planTree(tracks, rule, [warmup, closing]);
    expect(plan.playlists.filter((playlist) => playlist.sourcePath.startsWith("Mixes/2025/Summer"))).toEqual([
      // The folder's own playlist stays in path order.
      { sourcePath: "Mixes/2025/Summer", name: "Summer", folderPath: "Mixes/2025", trackIds: [3, 2] },
      { sourcePath: "Mixes/2025/Summer/Closing.M3U8", name: "Closing", folderPath: "Mixes/2025", trackIds: [4, 2], playlistFile: { relPath: closing.relPath, missing: 0 } },
      { sourcePath: "Mixes/2025/Summer/warm up.m3u", name: "warm up", folderPath: "Mixes/2025", trackIds: [2], playlistFile: { relPath: warmup.relPath, missing: 0 } },
    ]);
  });

  test("a file that matches nothing is ignored, as is one outside the rule's folder", () => {
    const empty = { relPath: "Mixes/2025/Summer/empty.m3u8", entries: ["Mixes/2025/Summer/gone.mp3"] };
    const outside = { relPath: "Mixes2/other.m3u8", entries: ["Mixes2/other.mp3"] };
    expect(planTree(tracks, rule, [empty, outside])).toEqual(planTree(tracks, rule));
    // With the empty one out of the way, the other is the folder's only playlist file.
    expect(playlistAt(planTree(tracks, rule, [empty, summer]), "Mixes/2025/Summer")?.trackIds).toEqual([2, 3]);
  });

  test("folder mode takes no notice of playlist files", () => {
    const folder = { ...rule, mode: "folder" as const };
    expect(planTree(tracks, folder, [summer])).toEqual(planTree(tracks, folder));
  });
});
