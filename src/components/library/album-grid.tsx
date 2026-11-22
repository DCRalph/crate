"use client";

import Link from "next/link";
import { useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { toast } from "sonner";

import { usePlayer } from "~/components/player/store";
import { Skeleton } from "~/components/ui/skeleton";
import { useTRPC } from "~/trpc/react";
import { Cover } from "./cover";

export type AlbumTile = { id: number; name: string; artistName: string; year: number | null };

const grid = "grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6";

/**
 * Albums as cover tiles. Hovering one brings up a play button, so an album
 * can be started without opening it. Tiles arrive one after another, like
 * sleeves being flipped forward. `showArtist` is off on an artist's own page.
 */
export function AlbumGrid({ albums, showArtist = true }: { albums: AlbumTile[]; showArtist?: boolean }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  /** The album most recently asked for, so a slower earlier request can't start over it. */
  const wanted = useRef<number | null>(null);
  const playAlbum = async (album: AlbumTile) => {
    wanted.current = album.id;
    try {
      const { tracks } = await queryClient.fetchQuery(trpc.library.album.queryOptions({ id: album.id }));
      if (wanted.current === album.id) usePlayer.getState().play(tracks);
    } catch {
      toast.error(`Couldn't play ${album.name}.`);
    }
  };

  return (
    <ul className={grid}>
      {albums.map((album, index) => (
        <li
          key={album.id}
          className="group animate-rise relative min-w-0"
          // The first row or two stagger; anything later arrives together rather than keeping people waiting.
          style={{ animationDelay: `${Math.min(index % 60, 11) * 28}ms` }}
        >
          <Link href={`/albums/${album.id}`} className="block rounded-md outline-none">
            <Cover
              type="album"
              id={album.id}
              size={400}
              className="group-focus-within:ring-ring/50 w-full group-focus-within:ring-[3px]"
              imageClassName="group-hover:scale-[1.04]"
            />
            <p className="mt-2 truncate text-[13px] font-medium group-hover:underline">{album.name}</p>
            <p className="text-muted-foreground truncate text-xs">
              {[showArtist ? album.artistName : null, album.year].filter(Boolean).join(" · ")}
            </p>
          </Link>
          {/* A sibling of the link, not a child: a button can't sit inside an anchor. Sized against the square cover.
              The same white disc as the player's play button, so it reads on any artwork. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 aspect-square">
            <button
              type="button"
              aria-label={`Play ${album.name}`}
              onClick={() => playAlbum(album)}
              className="bg-foreground text-background focus-visible:ring-ring/50 pointer-events-auto absolute right-2 bottom-2 grid size-10 translate-y-1.5 place-items-center rounded-full opacity-0 shadow-lg shadow-black/40 outline-none transition-[opacity,transform] duration-200 ease-(--ease-out-expo) group-hover:translate-y-0 group-hover:opacity-100 hover:scale-105 focus-visible:translate-y-0 focus-visible:opacity-100 focus-visible:ring-[3px] active:scale-95 pointer-coarse:hidden"
            >
              <Play className="size-4 translate-x-px fill-current" />
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
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="mt-2 h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}
