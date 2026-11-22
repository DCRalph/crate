"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Folder, Pin, Play } from "lucide-react";
import { toast } from "sonner";

import { Cover } from "~/components/library/cover";
import { rowNumber, useNumbered } from "~/components/player/selection";
import { usePlayer } from "~/components/player/store";
import { count } from "~/lib/format";
import { itemsUnder, type Tree, type TreeNode } from "~/lib/tree";
import { cn } from "~/lib/utils";
import { useTRPC, type RouterOutputs } from "~/trpc/react";
import { usePin } from "./use-pin";

type FolderRow = RouterOutputs["playlists"]["tree"]["folders"][number];
type PlaylistRow = RouterOutputs["playlists"]["tree"]["playlists"][number];
type Level = Tree<FolderRow, PlaylistRow>;

/** Counts tile plays, so a playlist asked for earlier can't start over a later one when its tracks arrive late. */
let playRequests = 0;

const grid = "grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5";
const tile = "group animate-rise relative min-w-0";
const strip = "print block overflow-hidden rounded-b-[3px]";
const stripName = "t-label block truncate px-2 text-[12.5px] leading-6";
const stripBand = "bg-brand block truncate px-2 text-xs leading-5 font-medium";

/** The folder `id` and the folders above it, top first, or nothing when it isn't in the tree. */
function pathTo(level: Level, id: number): TreeNode<FolderRow, PlaylistRow>[] {
  for (const node of level.folders) {
    if (node.folder.id === id) return [node];
    const below = pathTo(node, id);
    if (below.length) return [node, ...below];
  }
  return [];
}

/**
 * Playlists as big covers, the way albums are shown. A folder is a tile made
 * of the covers inside it, and opening one shows what it holds; where you are
 * is in the address, so Back works. Pinned playlists come first at the top
 * level. `flat` shows just those playlists with no folders, for search results.
 */
export function PlaylistGrid({ tree, flat }: { tree: Level; flat?: PlaylistRow[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const togglePin = usePin();
  const folderId = Number(useSearchParams().get("folder")) || null;
  const trail = folderId === null || flat ? [] : pathTo(tree, folderId);
  const here: Level = trail.at(-1) ?? tree;
  const atTop = trail.length === 0;

  const pinned = atTop && !flat ? itemsUnder(tree).filter((playlist) => playlist.pinnedAt) : [];
  const folders = flat ? [] : here.folders;
  // At the top level a pinned playlist is already up front, so it isn't shown a second time.
  const playlists = flat ?? [...pinned, ...here.items.filter((playlist) => !atTop || !playlist.pinnedAt)];
  const open = (id: number | null) => router.push(id === null ? pathname : `${pathname}?folder=${id}`);

  const play = async (playlist: PlaylistRow) => {
    const request = ++playRequests;
    try {
      const { tracks } = await queryClient.fetchQuery(trpc.playlists.byId.queryOptions({ id: playlist.id }));
      if (request === playRequests) usePlayer.getState().play(tracks);
    } catch {
      toast.error(`Couldn't play ${playlist.name}.`);
    }
  };
  // Tiles are numbered in the order shown: folders, then playlists. A folder's number opens it.
  useNumbered(folders.length + playlists.length, (index) => {
    const folder = folders[index];
    if (folder) open(folder.folder.id);
    else void play(playlists[index - folders.length]!);
  });

  return (
    <>
      {trail.length ? (
        <nav aria-label="Folder" className="t-label text-muted-foreground mb-4 flex flex-wrap items-center gap-1 text-[11.5px]">
          <button type="button" className="hover:text-foreground outline-none focus-visible:underline" onClick={() => open(null)}>
            All playlists
          </button>
          {trail.map((node, index) => (
            <span key={node.folder.id} className="flex items-center gap-1">
              <ChevronRight className="size-3.5" aria-hidden />
              {index === trail.length - 1 ? (
                <span className="text-foreground">{node.folder.name}</span>
              ) : (
                <button type="button" className="hover:text-foreground outline-none focus-visible:underline" onClick={() => open(node.folder.id)}>
                  {node.folder.name}
                </button>
              )}
            </span>
          ))}
        </nav>
      ) : null}

      {folders.length || playlists.length ? (
        <ul className={grid}>
          {folders.map((node, index) => {
            const inside = itemsUnder(node);
            return (
              <li key={`f${node.folder.id}`} className={tile} style={{ animationDelay: `${Math.min(index, 11) * 28}ms` }}>
                <Link
                  href={`${pathname}?folder=${node.folder.id}`}
                  className="group-focus-within:ring-ring/60 block rounded-[3px] outline-none group-focus-within:ring-[3px]"
                >
                  {/* A folder looks like what is in it: up to four of its covers. */}
                  <span className="bg-secondary grid aspect-square grid-cols-2 grid-rows-2 overflow-hidden rounded-t-[3px]">
                    {inside.slice(0, 4).map((playlist) => (
                      <Cover key={playlist.id} type="playlist" id={playlist.id} version={playlist.coverKey} size={240} className="size-full rounded-none" />
                    ))}
                  </span>
                  <span className={strip}>
                    <span className={stripName}>{node.folder.name}</span>
                    <span className={stripBand}>{count(inside.length, "playlist")}</span>
                  </span>
                </Link>
                <span className="plate pointer-events-none absolute top-1.5 left-1.5" aria-hidden>
                  <span className="flex items-center gap-1">
                    <Folder className="size-3" />
                    {rowNumber(index)}
                  </span>
                </span>
              </li>
            );
          })}
          {playlists.map((playlist, index) => (
            <li key={`p${playlist.id}`} className={tile} style={{ animationDelay: `${Math.min(folders.length + index, 11) * 28}ms` }}>
              <Link href={`/playlists/${playlist.id}`} className="group-focus-within:ring-ring/60 block rounded-[3px] outline-none group-focus-within:ring-[3px]">
                <Cover type="playlist" id={playlist.id} version={playlist.coverKey} size={400} className="w-full rounded-b-none" imageClassName="group-hover:scale-[1.04]" />
                <span className={strip}>
                  <span className={stripName}>{playlist.name}</span>
                  <span className={stripBand}>
                    {count(playlist.trackCount, "track")}
                    {playlist.isMine ? "" : ` · ${playlist.ownerName}`}
                  </span>
                </span>
              </Link>
              <span className="plate pointer-events-none absolute top-1.5 left-1.5" aria-hidden>
                {rowNumber(folders.length + index)}
              </span>
              {/* Siblings of the link, not children: a button can't sit inside an anchor. Sized against the square cover. */}
              <div className="pointer-events-none absolute inset-x-0 top-0 aspect-square">
                <button
                  type="button"
                  aria-label={playlist.pinnedAt ? `Unpin ${playlist.name}` : `Pin ${playlist.name} to the top`}
                  aria-pressed={!!playlist.pinnedAt}
                  onClick={() => togglePin(playlist)}
                  className={cn(
                    "plate focus-visible:ring-ring/60 pointer-events-auto absolute top-1.5 right-1.5 outline-none transition-opacity focus-visible:ring-[3px]",
                    // A pinned one always shows its pin; the rest offer it on hover.
                    playlist.pinnedAt ? "text-lamp" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100",
                  )}
                >
                  <Pin className={cn("size-3.5", playlist.pinnedAt && "fill-current")} />
                </button>
                <button
                  type="button"
                  aria-label={`Play ${playlist.name}`}
                  onClick={() => play(playlist)}
                  className="key bg-brand text-ink focus-visible:ring-ring/60 pointer-events-auto absolute right-2 bottom-2 grid h-9 w-11 translate-y-1.5 place-items-center rounded-md opacity-0 outline-none transition-[opacity,translate] duration-200 ease-(--ease-out-expo) group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100 focus-visible:ring-[3px] pointer-coarse:hidden"
                >
                  <Play className="size-4 fill-current" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground py-6 text-sm">{flat ? "Nothing called that." : "This folder is empty."}</p>
      )}
    </>
  );
}
