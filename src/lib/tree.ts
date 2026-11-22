const byName = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** A folder with what is directly inside it. Folders hold folders and items; items are always leaves. */
export type TreeNode<F, P> = { folder: F; folders: TreeNode<F, P>[]; items: P[] };
export type Tree<F, P> = { folders: TreeNode<F, P>[]; items: P[] };

/**
 * Nests a flat list of folders and the items that sit in them. `keys` says
 * how to read each one's own key, its parent and its place. Everything comes
 * out sorted by name with numbers compared as numbers, folders before items.
 * A folder or item whose parent isn't in the list lands at the top.
 */
export function buildTree<K, F extends { name: string }, P extends { name: string }>(
  folders: F[],
  items: P[],
  keys: { of: (folder: F) => K; parent: (folder: F) => K | null; place: (item: P) => K | null },
): Tree<F, P> {
  const nodes = new Map(folders.map((folder) => [keys.of(folder), { folder, folders: [], items: [] } as TreeNode<F, P>]));
  const top: Tree<F, P> = { folders: [], items: [] };
  const at = (key: K | null) => (key === null ? top : (nodes.get(key) ?? top));
  for (const node of nodes.values()) at(keys.parent(node.folder)).folders.push(node);
  for (const item of items) at(keys.place(item)).items.push(item);

  const sort = (level: Tree<F, P>) => {
    level.folders.sort((a, b) => byName.compare(a.folder.name, b.folder.name));
    level.items.sort((a, b) => byName.compare(a.name, b.name));
    level.folders.forEach(sort);
  };
  sort(top);
  return top;
}

/** Every item under a folder, however deep. */
export function itemsUnder<F, P>(node: Tree<F, P>): P[] {
  return [...node.items, ...node.folders.flatMap(itemsUnder)];
}

/** Every folder in the tree, top down, with its depth and its path in words ("Mixes / 2025"). */
export function flattenFolders<F extends { name: string }, P>(tree: Tree<F, P>, depth = 0, above = ""): { folder: F; depth: number; path: string }[] {
  return tree.folders.flatMap((node) => {
    const path = above ? `${above} / ${node.folder.name}` : node.folder.name;
    return [{ folder: node.folder, depth, path }, ...flattenFolders(node, depth + 1, path)];
  });
}
