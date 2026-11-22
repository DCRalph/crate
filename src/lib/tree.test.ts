import { describe, expect, test } from "bun:test";

import { buildTree, flattenFolders, itemsUnder } from "./tree";

const folders = [
  { id: 2, name: "2025", parentId: 1 },
  { id: 1, name: "Mixes", parentId: null },
  { id: 3, name: "10 old", parentId: 1 },
  { id: 9, name: "Orphan", parentId: 404 },
];
const items = [
  { name: "Winter", folderId: 2 },
  { name: "Summer", folderId: 2 },
  { name: "Loose", folderId: null },
  { name: "Top of mixes", folderId: 1 },
];
const keys = {
  of: (folder: (typeof folders)[number]) => folder.id,
  parent: (folder: (typeof folders)[number]) => folder.parentId,
  place: (item: (typeof items)[number]) => item.folderId,
};

describe("buildTree", () => {
  const tree = buildTree(folders, items, keys);

  test("nests folders and puts items in their folders, sorted by name", () => {
    expect(tree.items.map((item) => item.name)).toEqual(["Loose"]);
    // A folder whose parent isn't in the list lands at the top.
    expect(tree.folders.map((node) => node.folder.name)).toEqual(["Mixes", "Orphan"]);
    const mixes = tree.folders[0]!;
    // Numbers sort as numbers: 10 comes before 2025.
    expect(mixes.folders.map((node) => node.folder.name)).toEqual(["10 old", "2025"]);
    expect(mixes.items.map((item) => item.name)).toEqual(["Top of mixes"]);
    expect(mixes.folders[1]!.items.map((item) => item.name)).toEqual(["Summer", "Winter"]);
  });

  test("itemsUnder gathers every level", () => {
    expect(itemsUnder(tree.folders[0]!).map((item) => item.name)).toEqual(["Top of mixes", "Summer", "Winter"]);
  });

  test("flattenFolders gives depth and a path in words", () => {
    expect(flattenFolders(tree).map((row) => [row.depth, row.path])).toEqual([
      [0, "Mixes"],
      [1, "Mixes / 10 old"],
      [1, "Mixes / 2025"],
      [0, "Orphan"],
    ]);
  });
});
