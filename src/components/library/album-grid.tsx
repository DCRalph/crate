"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { toast } from "sonner";

import { rowNumber, useNumbered } from "~/components/player/selection";
import { usePlayer } from "~/components/player/store";
import { Skeleton } from "~/components/ui/skeleton";
import { useTRPC } from "~/trpc/react";
import { Cover } from "./cover";

export type AlbumTile = { id: number; name: string; artistName: string; year: number | null };

/**
 * Counts tile plays across every grid, so an album asked for earlier (even from
 * another page) can't start over a later one when its tracks arrive late.
 */
let playRequests = 0;

const grid = "grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6";

/**
 * Albums as cover tiles, each with a number plate and a title strip: the name
 * on ivory, the artist on the band. Typing a tile's number and Enter plays
 * the album, and hovering a tile brings up a play key. Tiles arrive one after
 * another, like pages being turned. `showArtist` is off on an artist's own page.
 */
export function AlbumGrid({ albums, showArtist = true }: { albums: AlbumTile[]; showArtist?: boolean }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const playAlbum = async (album: AlbumTile) => {
    const request = ++playRequests;
    try {
      const { tracks } = await queryClient.fetchQuery(trpc.library.album.queryOptions({ id: album.id }));
      if (request === playRequests) usePlayer.getState().play(tracks);
    } catch {
      toast.error(`Couldn't play ${album.name}.`);
    }
  };

  useNumbered(albums.length, (index) => void playAlbum(albums[index]!));

  return (
    <ul className={grid}>
      {albums.map((album, index) => (
        <li
          key={album.id}
          className="group animate-rise relative min-w-0"
          // The first row or two stagger; anything later arrives together rather than keeping people waiting.
          style={{ animationDelay: `${Math.min(index % 60, 11) * 28}ms` }}
        >
          <Link href={`/albums/${album.id}`} className="group-focus-within:ring-ring/60 block rounded-[3px] outline-none group-focus-within:ring-[3px]">
            <Cover type="album" id={album.id} size={400} className="w-full rounded-b-none" imageClassName="group-hover:scale-[1.04]" />
            <span className="print block overflow-hidden rounded-b-[3px]">
              <span className="t-label block truncate px-2 text-[12.5px] leading-6">{album.name}</span>
              <span className="bg-brand block truncate px-2 text-xs leading-5 font-medium">
                {[showArtist ? album.artistName : null, album.year].filter(Boolean).join(" · ") || "\u00a0"}
              </span>
            </span>
          </Link>
          <span className="plate pointer-events-none absolute top-1.5 left-1.5" aria-hidden>
            {rowNumber(index)}
          </span>
          {/* A sibling of the link, not a child: a button can't sit inside an anchor. Sized against the square cover. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 aspect-square">
            <button
              type="button"
              aria-label={`Play ${album.name}`}
              onClick={() => playAlbum(album)}
              className="key bg-brand text-ink focus-visible:ring-ring/60 pointer-events-auto absolute right-2 bottom-2 grid h-9 w-11 translate-y-1.5 place-items-center rounded-md opacity-0 outline-none transition-[opacity,translate] duration-200 ease-(--ease-out-expo) group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100 focus-visible:ring-[3px] pointer-coarse:hidden"
            >
              <Play className="size-4 fill-current" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Static placeholders in the grid's shape while albums load. */
export function AlbumGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className={grid}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <Skeleton className="aspect-square w-full rounded-b-none" />
          <Skeleton className="h-11 w-full rounded-t-none opacity-60" />
        </div>
      ))}
    </div>
  );
}
