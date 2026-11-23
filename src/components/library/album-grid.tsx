"use client";

import Link from "next/link";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { toast } from "sonner";

import { rowNumber, useNumbered } from "~/components/player/selection";
import { playWhenLoaded } from "~/components/player/store";
import { SharedCover } from "~/components/shell/transitions";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "~/components/ui/context-menu";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";
import { useTRPC } from "~/trpc/react";
import { Cover } from "./cover";
import { TilePlayKey } from "./play-key";
import { contextKit, QueueActions } from "./track-actions";

export type AlbumTile = { id: number; name: string; artistName: string; year: number | null };

const grid = "grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6";
/** One row of the grid: later rows have no height and are clipped away, with room left for a focus ring. */
export const oneRow = "auto-rows-[0] grid-rows-[auto] gap-y-0 overflow-clip [overflow-clip-margin:6px]";

/**
 * Albums as cover tiles, each with a number plate and a title strip: the name
 * on ivory, the artist on the band. Typing a tile's number and Enter plays
 * the album, hovering a tile brings up a play key, and a right-click queues
 * it or adds it to a playlist. Tiles arrive one after another, like pages
 * being turned.
 *  - `showArtist` is off on an artist's own page.
 *  - `numbered` is off where the page has another numbered list, or several grids: then there are no plates and numbers pick nothing here.
 *  - `row` keeps to one row of tiles, however many would fit a second.
 *  - `shared` names each cover for the page transition, so it travels to the album's own page. Where an album can be
 *    on the page twice it says which albums this grid may name.
 */
export function AlbumGrid({
  albums,
  showArtist = true,
  numbered = true,
  row = false,
  shared = true,
}: {
  albums: AlbumTile[];
  showArtist?: boolean;
  numbered?: boolean;
  row?: boolean;
  shared?: boolean | ((albumId: number) => boolean);
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  /** The album a right-click landed on. Kept after the menu closes, so the menu doesn't empty as it fades. */
  const [menuFor, setMenuFor] = useState<AlbumTile | null>(null);

  const tracksOf = async (album: AlbumTile) => (await queryClient.fetchQuery(trpc.library.album.queryOptions({ id: album.id }))).tracks;
  const playAlbum = async (album: AlbumTile) => {
    try {
      const result = await playWhenLoaded(() => tracksOf(album), `album:${album.id}`);
      if (result === "empty") toast(`${album.name} has no tracks.`);
    } catch {
      toast.error(`Couldn't play ${album.name}.`);
    }
  };

  useNumbered(albums.length, (index) => void playAlbum(albums[index]!), numbered);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <ul
          className={cn(grid, row && oneRow)}
          onContextMenu={(event) => {
            const tile = event.target instanceof Element ? event.target.closest<HTMLElement>("li[data-album]") : null;
            const album = albums.find((item) => item.id === Number(tile?.dataset.album));
            if (album) setMenuFor(album);
            else event.preventDefault();
          }}
        >
          {albums.map((album, index) => (
            <li
              key={album.id}
              data-album={album.id}
              className="group animate-rise relative min-w-0"
              // The first row or two stagger; anything later arrives together rather than keeping people waiting.
              style={{ animationDelay: `${Math.min(index % 60, 11) * 28}ms` }}
            >
              <Link href={`/albums/${album.id}`} className="group-focus-within:ring-ring/60 block rounded-[3px] outline-none group-focus-within:ring-[3px]">
                <SharedCover name={(typeof shared === "function" ? shared(album.id) : shared) ? `album-${album.id}` : undefined}>
                  <Cover type="album" id={album.id} size={400} className="w-full rounded-b-none" imageClassName="group-hover:scale-[1.04]" />
                </SharedCover>
                <span className="print block overflow-hidden rounded-b-[3px]">
                  <span className="t-label block truncate px-2 text-[12.5px] leading-6">{album.name}</span>
                  <span className="bg-brand block truncate px-2 text-xs leading-5 font-medium">
                    {[showArtist ? album.artistName : null, album.year].filter(Boolean).join(" · ") || "\u00a0"}
                  </span>
                </span>
              </Link>
              {numbered ? (
                <span className="plate pointer-events-none absolute top-1.5 left-1.5" aria-hidden>
                  {rowNumber(index)}
                </span>
              ) : null}
              {/* A sibling of the link, not a child: a button can't sit inside an anchor. Sized against the square cover. */}
              <div className="pointer-events-none absolute inset-x-0 top-0 aspect-square">
                <TilePlayKey from={`album:${album.id}`} name={album.name} onPlay={() => void playAlbum(album)} />
              </div>
            </li>
          ))}
        </ul>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        {menuFor ? (
          <>
            <ContextMenuItem onSelect={() => void playAlbum(menuFor)}>
              <Play />
              Play
            </ContextMenuItem>
            <QueueActions kit={contextKit} tracks={() => tracksOf(menuFor)} label={menuFor.name} />
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** Static placeholders in the grid's shape while albums load. `row` keeps to one row, like the grid it stands for. */
export function AlbumGridSkeleton({ count = 12, row = false }: { count?: number; row?: boolean }) {
  return (
    <div className={cn(grid, row && oneRow)}>
      {Array.from({ length: count }, (_, i) => (
        <TileSkeleton key={i} index={i} />
      ))}
    </div>
  );
}

/** A tile that hasn't arrived: the cover's square, then the title strip as it will be, ivory over the band. */
export function TileSkeleton({ index }: { index: number }) {
  return (
    <div aria-hidden>
      <Skeleton className="aspect-square w-full rounded-b-none" />
      <div className="print overflow-hidden rounded-b-[3px]">
        <div className="flex h-6 items-center px-2">
          <Skeleton className="h-2.5" style={{ width: `${45 + ((index * 17) % 40)}%` }} />
        </div>
        <div className="bg-brand h-5" />
      </div>
    </div>
  );
}
