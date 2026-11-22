import { expect, test } from "bun:test";

import { groupTracks } from "./group-tracks";

const tracks = [
  { id: 1, relPath: "Mixes/2024/Summer/10 - sunset.mp3" },
  { id: 2, relPath: "Mixes/2024/Summer/2 - beach.mp3" },
  { id: 3, relPath: "Mixes/2024/Winter/fireside.mp3" },
  { id: 4, relPath: "Mixes/Warmups/a.mp3" },
  { id: 5, relPath: "Mixes/loose.mp3" },
  { id: 6, relPath: "Albums/Homework/01.mp3" },
  { id: 7, relPath: "Mixes Extra/x.mp3" },
];
const rule = (path: string, mode: "subfolders" | "folder" | "leaves") => ({ path, mode, libraryName: "Main" });
const summary = (groups: ReturnType<typeof groupTracks>) => groups.map((g) => [g.sourcePath, g.name, g.trackIds]);

test("subfolders: one playlist per immediate subfolder, loose files left out", () => {
  expect(summary(groupTracks(tracks, rule("Mixes", "subfolders")))).toEqual([
    ["Mixes/2024", "2024", [2, 1, 3]],
    ["Mixes/Warmups", "Warmups", [4]],
  ]);
});

test("numbers in file names sort as numbers", () => {
  const [summer] = groupTracks(tracks, rule("Mixes/2024", "subfolders"));
  expect(summer?.trackIds).toEqual([2, 1]);
});

test("leaves: every folder holding tracks, named by its path under the rule", () => {
  expect(summary(groupTracks(tracks, rule("Mixes", "leaves")))).toEqual([
    ["Mixes", "Mixes", [5]],
    ["Mixes/2024/Summer", "2024 / Summer", [2, 1]],
    ["Mixes/2024/Winter", "2024 / Winter", [3]],
    ["Mixes/Warmups", "Warmups", [4]],
  ]);
});

test("folder: the whole folder is one playlist", () => {
  expect(summary(groupTracks(tracks, rule("Mixes/2024", "folder")))).toEqual([["Mixes/2024", "2024", [2, 1, 3]]]);
});

test("a folder whose name only starts the same is not inside the rule", () => {
  const ids = groupTracks(tracks, rule("Mixes", "folder")).flatMap((g) => g.trackIds);
  expect(ids).not.toContain(7);
});

test("the library root is named after the library, and slashes around the path don't matter", () => {
  expect(groupTracks(tracks, rule("", "folder"))[0]).toMatchObject({ sourcePath: "", name: "Main" });
  expect(summary(groupTracks(tracks, rule("/Mixes/", "subfolders")))).toEqual(summary(groupTracks(tracks, rule("Mixes", "subfolders"))));
});
