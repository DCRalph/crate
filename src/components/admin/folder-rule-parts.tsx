"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Folder, ListMusic, Search } from "lucide-react";

import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { count } from "~/lib/format";
import { buildTree, type Tree } from "~/lib/tree";
import { cn } from "~/lib/utils";
import { useTRPC, type RouterOutputs } from "~/trpc/react";

type Mode = RouterOutputs["admin"]["folderRules"]["list"][number]["mode"];

/** The two things a folder rule can make, as people read them. */
export const ruleModes: Record<Mode, { label: string; detail: string }> = {
  tree: { label: "Match the folder tree", detail: "Folders that hold folders become folders. Folders that hold tracks become playlists." },
  folder: { label: "One playlist", detail: "The folder and everything under it becomes a single playlist." },
};

/** Picks one of the modes: a short radio list, each option saying what it makes. */
export function ModePicker({ value, onChange, disabled }: { value: Mode; onChange: (mode: Mode) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="What it makes" className="grid gap-2 sm:grid-cols-2">
      {(Object.keys(ruleModes) as Mode[]).map((mode) => (
        <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={value === mode}
          disabled={disabled}
          onClick={() => onChange(mode)}
          className={cn(
            "focus-visible:ring-ring/50 rounded-md border p-3 text-left outline-none transition-colors focus-visible:ring-[3px] disabled:opacity-50",
            value === mode ? "border-foreground bg-accent/50" : "hover:bg-accent/30",
          )}
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <span className={cn("grid size-3.5 place-items-center rounded-full border", value === mode && "border-foreground")}>
              {value === mode ? <span className="bg-foreground size-1.5 rounded-full" /> : null}
            </span>
            {ruleModes[mode].label}
          </span>
          <span className="text-muted-foreground mt-1 block text-xs">{ruleModes[mode].detail}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Picks a folder inside a library from the ones already scanned, shown as the
 * tree they form, each with the tracks sitting directly in it. "" is the
 * library's own folder.
 */
export function LibraryFolderPicker({ libraryId, value, onChange }: { libraryId: number; value: string; onChange: (path: string) => void }) {
  const trpc = useTRPC();
  const folders = useQuery(trpc.admin.libraries.folders.queryOptions({ id: libraryId }));
  const [filter, setFilter] = useState("");
  const text = filter.trim().toLowerCase();
  const shown = (folders.data ?? []).filter((folder) => !text || folder.path.toLowerCase().includes(text));

  if (folders.isPending) return <Skeleton className="h-40" />;
  if (!folders.data?.length) {
    return <p className="text-muted-foreground rounded-md border p-3 text-sm">Nothing is scanned in this library yet. Scan it first.</p>;
  }
  return (
    <div className="rounded-md border">
      <div className="relative border-b">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          aria-label="Find a folder"
          placeholder="Find a folder"
          className="rounded-none border-0 pl-9 shadow-none focus-visible:ring-0"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>
      <ul role="listbox" aria-label="Folder" className="max-h-64 overflow-y-auto p-1">
        {shown.map((folder) => {
          const depth = folder.path ? folder.path.split("/").length : 0;
          const selected = folder.path === value;
          return (
            <li key={folder.path} role="option" aria-selected={selected}>
              <button
                type="button"
                onClick={() => onChange(folder.path)}
                className={cn(
                  "focus-visible:ring-ring/50 flex w-full items-center gap-2 rounded-sm py-1.5 pr-2 text-left text-sm outline-none focus-visible:ring-[3px]",
                  selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                )}
                // Indented by depth, unless a search has flattened the list.
                style={{ paddingLeft: `${0.5 + (text ? 0 : depth) * 1.1}rem` }}
              >
                <Folder className="text-muted-foreground size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{text ? folder.path || "Whole library" : folder.path ? folder.path.split("/").at(-1) : "Whole library"}</span>
                {folder.tracks ? <span className="text-muted-foreground text-xs tabular-nums">{count(folder.tracks, "track")}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type Preview = RouterOutputs["admin"]["folderRules"]["preview"];
type PreviewTree = Tree<Preview["folders"][number], Preview["playlists"][number]>;

function PreviewLevel({ level, depth }: { level: PreviewTree; depth: number }) {
  const indent = { paddingLeft: `${depth * 1.25}rem` };
  return (
    <>
      {level.folders.map((node) => (
        <li key={`f${node.folder.sourcePath}`}>
          <p className="flex items-center gap-2 py-1 text-sm" style={indent}>
            <Folder className="text-muted-foreground size-4 shrink-0" />
            <span className="truncate font-medium">{node.folder.name}</span>
          </p>
          <ul>
            <PreviewLevel level={node} depth={depth + 1} />
          </ul>
        </li>
      ))}
      {level.items.map((playlist) => (
        <li key={`p${playlist.sourcePath}`} className="flex items-center gap-2 py-1 text-sm" style={indent}>
          <ListMusic className="text-muted-foreground size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{playlist.name}</span>
          <span className="text-muted-foreground text-xs tabular-nums">{count(playlist.trackCount, "track")}</span>
        </li>
      ))}
    </>
  );
}

/** What a rule makes from what is scanned right now: totals, then the tree itself. */
export function RulePreview({ libraryId, path, mode }: { libraryId: number; path: string; mode: Mode }) {
  const trpc = useTRPC();
  const preview = useQuery(trpc.admin.folderRules.preview.queryOptions({ libraryId, path, mode }));
  const tree = useMemo(
    () =>
      buildTree(preview.data?.folders ?? [], preview.data?.playlists ?? [], {
        of: (folder) => folder.sourcePath,
        parent: (folder) => folder.parentPath,
        place: (playlist) => playlist.folderPath,
      }),
    [preview.data],
  );

  if (preview.isPending) return <Skeleton className="h-32" />;
  if (preview.isError) return <p className="text-destructive text-sm">{preview.error.message}</p>;
  const data = preview.data;
  if (!data.playlistCount) return <p className="text-muted-foreground text-sm">There are no tracks in that folder, so nothing would be made.</p>;
  const hidden = data.folderCount + data.playlistCount - data.folders.length - data.playlists.length;

  return (
    <div>
      <p className="text-muted-foreground mb-2 text-xs tabular-nums">
        {[data.folderCount ? count(data.folderCount, "folder") : null, count(data.playlistCount, "playlist"), count(data.trackCount, "track")].filter(Boolean).join(", ")}
      </p>
      <ul className="max-h-80 overflow-y-auto rounded-md border px-3 py-2">
        <PreviewLevel level={tree} depth={0} />
      </ul>
      {hidden > 0 ? <p className="text-muted-foreground mt-2 text-xs">And {count(hidden, "more item")} not shown.</p> : null}
    </div>
  );
}
