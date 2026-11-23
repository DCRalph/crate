"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { toast } from "sonner";

import { rowNumber, tileCode, useNumbered, type RowLetter } from "~/components/player/selection";
import { playWhenLoaded, usePlayer } from "~/components/player/store";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "~/components/ui/context-menu";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";
import { useTRPC } from "~/trpc/react";
import { TilePlayKey } from "./play-key";
import { oneRow, Tile, tileGrid } from "./tile";
import { contextKit, QueueActions } from "./track-actions";

export type AlbumTile = { id: number; name: string; artistName: string; year: number | null };

/**
 * Albums as cover tiles (see `Tile`). Typing a tile's code and Enter plays
 * the album, hovering a tile brings up a play key, and a right-click queues
 * it or adds it to a playlist. The album that is playing is lit.
 *  - `showArtist` is off on an artist's own page.
 *  - `numbered` is off where the page has another numbered list: then there are no plates and codes pick nothing here.
 *  - `letter` gives the grid a row letter, for a page with several: its plates read "B3".
 *  - `row` keeps to one row of tiles, however many would fit a second.
 *  - `shared` names each cover for the page transition, so it travels to the album's own page. Where an album can be
 *    on the page twice it says which albums this grid may name.
 */
export function AlbumGrid({
  albums,
  showArtist = true,
  numbered = true,
  letter,
  row = false,
  shared = true,
}: {
  albums: AlbumTile[];
  showArtist?: boolean;
  numbered?: boolean;
  letter?: RowLetter;
  row?: boolean;
  shared?: boolean | ((albumId: number) => boolean);
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const sounding = usePlayer((state) => (state.playing ? state.from : null));
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

  useNumbered(albums.length, (index) => void playAlbum(albums[index]!), numbered, letter);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <ul
          className={cn(tileGrid, row && oneRow)}
          onContextMenu={(event) => {
            const tile = event.target instanceof Element ? event.target.closest<HTMLElement>("li[data-album]") : null;
            const album = albums.find((item) => item.id === Number(tile?.dataset.album));
            if (album) setMenuFor(album);
            else event.preventDefault();
          }}
        >
          {albums.map((album, index) => (
            <Tile
              key={album.id}
              data-album={album.id}
              index={index}
              href={`/albums/${album.id}`}
              cover={{ type: "album", id: album.id }}
              shared={(typeof shared === "function" ? shared(album.id) : shared) ? `album-${album.id}` : undefined}
              name={album.name}
              band={[showArtist ? album.artistName : null, album.year].filter(Boolean).join(" · ")}
              code={numbered ? (letter ? tileCode(letter, index) : rowNumber(index)) : undefined}
              lit={sounding === `album:${album.id}`}
              overlay={<TilePlayKey from={`album:${album.id}`} name={album.name} onPlay={() => void playAlbum(album)} />}
            />
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
    <div className={cn(tileGrid, row && oneRow)}>
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
