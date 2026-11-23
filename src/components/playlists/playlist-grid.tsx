"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Folder, Pin, Play, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { TileSkeleton } from "~/components/library/album-grid";
import { oneRow, Tile, tileGrid } from "~/components/library/tile";
import { Cover } from "~/components/library/cover";
import { TilePlayKey } from "~/components/library/play-key";
import { contextKit, QueueActions } from "~/components/library/track-actions";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "~/components/ui/context-menu";
import { rowNumber, tileCode, useNumbered, type RowLetter } from "~/components/player/selection";
import { playWhenLoaded, usePlayer } from "~/components/player/store";
import { count } from "~/lib/format";
import { defaultPlayRange } from "~/lib/most-played";
import { itemsUnder, type Tree, type TreeNode } from "~/lib/tree";
import { cn } from "~/lib/utils";
import { useTRPC, type RouterOutputs } from "~/trpc/react";
import { usePin } from "./use-pin";

type FolderRow = RouterOutputs["playlists"]["tree"]["folders"][number];
type PlaylistRow = RouterOutputs["playlists"]["tree"]["playlists"][number];
type Level = Tree<FolderRow, PlaylistRow>;


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
 * `mostPlayed` puts the Most played tile before everything at the top level.
 */
export function PlaylistGrid({
  tree,
  flat,
  numbered = true,
  letter,
  row = false,
  mostPlayed = false,
}: {
  tree: Level;
  flat?: PlaylistRow[];
  numbered?: boolean;
  /** A row letter, for a page with several numbered rows: plates then read "A2". */
  letter?: RowLetter;
  row?: boolean;
  mostPlayed?: boolean;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const togglePin = usePin();
  const sounding = usePlayer((state) => (state.playing ? state.from : null));
  const folderId = Number(useSearchParams().get("folder")) || null;
  const trail = folderId === null || flat ? [] : pathTo(tree, folderId);
  const here: Level = trail.at(-1) ?? tree;
  const atTop = trail.length === 0;

  const pinned = atTop && !flat ? itemsUnder(tree).filter((playlist) => playlist.pinnedAt) : [];
  const folders = flat ? [] : here.folders;
  // At the top level a pinned playlist is already up front, so it isn't shown a second time.
  const playlists = flat ?? [...pinned, ...here.items.filter((playlist) => !atTop || !playlist.pinnedAt)];
  const lead = mostPlayed && atTop;
  const open = (id: number | null) => router.push(id === null ? pathname : `${pathname}?folder=${id}`);

  /** The playlist a right-click landed on. Kept after the menu closes, so the menu doesn't empty as it fades. */
  const [menuFor, setMenuFor] = useState<PlaylistRow | null>(null);
  const tracksOf = async (playlist: PlaylistRow) => (await queryClient.fetchQuery(trpc.playlists.byId.queryOptions({ id: playlist.id }))).tracks;
  const play = async (playlist: PlaylistRow) => {
    try {
      const result = await playWhenLoaded(() => tracksOf(playlist), `playlist:${playlist.id}`);
      if (result === "empty") toast(`${playlist.name} is empty.`);
    } catch {
      toast.error(`Couldn't play ${playlist.name}.`);
    }
  };
  // Tiles are numbered in the order shown: folders, then playlists. A folder's number opens it.
  useNumbered(
    folders.length + playlists.length,
    (index) => {
      const folder = folders[index];
      if (folder) open(folder.folder.id);
      else void play(playlists[index - folders.length]!);
    },
    numbered,
    letter,
  );
  const codeOf = (index: number) => (letter ? tileCode(letter, index) : rowNumber(index));

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

      {lead || folders.length || playlists.length ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <ul
              className={cn(tileGrid, row && oneRow)}
              onContextMenu={(event) => {
                const tile = event.target instanceof Element ? event.target.closest<HTMLElement>("li[data-playlist]") : null;
                const playlist = playlists.find((item) => item.id === Number(tile?.dataset.playlist));
                if (playlist) setMenuFor(playlist);
                else event.preventDefault();
              }}
            >
              {lead ? <MostPlayedTile /> : null}
              {folders.map((node, index) => {
                const inside = itemsUnder(node);
                return (
                  <Tile
                    key={`f${node.folder.id}`}
                    index={index}
                    href={`${pathname}?folder=${node.folder.id}`}
                    // A folder looks like what is in it: up to four of its covers.
                    cover={{
                      mosaic: (
                        <span className="bg-secondary grid aspect-square grid-cols-2 grid-rows-2 overflow-hidden rounded-t-[3px]">
                          {inside.slice(0, 4).map((playlist) => (
                            <Cover key={playlist.id} type="playlist" id={playlist.id} version={playlist.coverKey} size={240} className="size-full rounded-none" />
                          ))}
                        </span>
                      ),
                    }}
                    name={node.folder.name}
                    band={count(inside.length, "playlist")}
                    lit={sounding !== null && inside.some((playlist) => sounding === `playlist:${playlist.id}`)}
                    code={
                      <span className="flex items-center gap-1">
                        <Folder className="size-3" />
                        {codeOf(index)}
                      </span>
                    }
                  />
                );
              })}
              {playlists.map((playlist, index) => (
                <Tile
                  key={`p${playlist.id}`}
                  data-playlist={playlist.id}
                  index={folders.length + index}
                  href={`/playlists/${playlist.id}`}
                  cover={{ type: "playlist", id: playlist.id, version: playlist.coverKey }}
                  shared={`playlist-${playlist.id}`}
                  name={playlist.name}
                  band={`${count(playlist.trackCount, "track")}${playlist.isMine ? "" : ` · ${playlist.ownerName}`}`}
                  code={numbered ? codeOf(folders.length + index) : undefined}
                  lit={sounding === `playlist:${playlist.id}`}
                  overlay={
                    <>
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
                      <TilePlayKey from={`playlist:${playlist.id}`} name={playlist.name} onPlay={() => void play(playlist)} />
                    </>
                  }
                />
              ))}
            </ul>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-52">
            {menuFor ? (
              <>
                <ContextMenuItem onSelect={() => void play(menuFor)}>
                  <Play />
                  Play
                </ContextMenuItem>
                <QueueActions kit={contextKit} tracks={() => tracksOf(menuFor)} label={menuFor.name} />
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={() => togglePin(menuFor)}>
                  <Pin />
                  {menuFor.pinnedAt ? "Unpin" : "Pin to the top"}
                </ContextMenuItem>
              </>
            ) : null}
          </ContextMenuContent>
        </ContextMenu>
      ) : (
        <p className="text-muted-foreground py-6 text-sm">{flat ? "Nothing called that." : "This folder is empty."}</p>
      )}
    </>
  );
}

/**
 * The way into Most played, as a folder's tile is drawn: the covers of the
 * albums played most lately, four of them when there are four, or the top
 * one alone. It isn't numbered, so the playlists keep their numbers.
 */
function MostPlayedTile() {
  const trpc = useTRPC();
  const mostPlayed = useQuery(trpc.library.mostPlayed.queryOptions({ range: defaultPlayRange }));
  const tracks = mostPlayed.data ?? [];
  const albums = [...new Set(tracks.map((track) => track.albumId))];
  const from = `most-played:${defaultPlayRange}`;

  const sounding = usePlayer((state) => state.playing && state.from === from);

  return (
    <Tile
      index={0}
      href="/most-played"
      cover={{
        mosaic:
          albums.length >= 4 ? (
            <span className="bg-secondary grid aspect-square grid-cols-2 grid-rows-2 overflow-hidden rounded-t-[3px]">
              {albums.slice(0, 4).map((id) => (
                <Cover key={id} type="album" id={id} size={240} className="size-full rounded-none" />
              ))}
            </span>
          ) : albums[0] ? (
            <Cover type="album" id={albums[0]} size={400} className="w-full rounded-b-none" imageClassName="group-hover:scale-[1.04]" />
          ) : (
            <span className="bg-secondary block aspect-square rounded-t-[3px]" />
          ),
      }}
      name="Most played"
      band={mostPlayed.data ? count(tracks.length, "track") : ""}
      code={<TrendingUp className="size-3" />}
      lit={sounding}
      overlay={tracks.length ? <TilePlayKey from={from} name="Most played" onPlay={() => usePlayer.getState().play(tracks, undefined, from)} /> : undefined}
    />
  );
}

/** Static placeholders in the grid's shape while playlists load. */
export function PlaylistGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className={tileGrid}>
      {Array.from({ length: count }, (_, i) => (
        <TileSkeleton key={i} index={i} />
      ))}
    </div>
  );
}
