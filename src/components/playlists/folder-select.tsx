"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { buildTree, flattenFolders } from "~/lib/tree";
import { useTRPC } from "~/trpc/react";

const top = "top";

/**
 * Picks where something sits in your playlist tree: the top level or one of
 * your own folders. Folders that follow the disk aren't offered, since nothing
 * can be put in them. `exclude` leaves out a folder and everything under it,
 * for moving that folder itself.
 */
export function FolderSelect({
  id,
  value,
  onChange,
  exclude,
  disabled,
}: {
  id?: string;
  value: number | null;
  onChange: (folderId: number | null) => void;
  exclude?: number;
  disabled?: boolean;
}) {
  const trpc = useTRPC();
  const tree = useQuery(trpc.playlists.tree.queryOptions());
  const options = useMemo(() => {
    const mine = (tree.data?.folders ?? []).filter((folder) => folder.isMine && folder.canEdit);
    const nested = buildTree(mine, [], { of: (folder) => folder.id, parent: (folder) => folder.parentId, place: () => null });
    const excluded = (node: (typeof nested.folders)[number]): boolean => node.folder.id === exclude;
    const prune = (level: typeof nested): typeof nested => ({
      items: [],
      folders: level.folders.filter((node) => !excluded(node)).map((node) => ({ ...node, ...prune(node) })),
    });
    return flattenFolders(prune(nested));
  }, [tree.data, exclude]);

  return (
    <Select value={value === null ? top : String(value)} onValueChange={(next) => onChange(next === top ? null : Number(next))} disabled={disabled}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={top}>Top level</SelectItem>
        {options.map(({ folder, path }) => (
          <SelectItem key={folder.id} value={String(folder.id)}>
            {path}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
