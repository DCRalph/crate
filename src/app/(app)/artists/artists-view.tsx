"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { Cover } from "~/components/library/cover";
import { Page } from "~/components/shell/page";
import { Empty, LoadError } from "~/components/shell/states";
import { Skeleton } from "~/components/ui/skeleton";
import { count } from "~/lib/format";
import { useTRPC } from "~/trpc/react";

/** Everyone credited on a track or album, alphabetically. Joint credits are listed as their artists. */
export function ArtistsView() {
  const trpc = useTRPC();
  const artists = useQuery(trpc.library.artists.queryOptions());

  return (
    <Page detail={artists.data ? count(artists.data.length, "artist") : null}>
      {artists.isPending ? (
        <div className="print grid gap-x-8 rounded-lg px-5 py-2 shadow-[0_1px_2px_rgb(0_0_0/0.14)] sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
          {Array.from({ length: 18 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 border-b py-2">
              <Skeleton className="size-9 rounded-[3px]" />
              <Skeleton className="h-4" style={{ width: `${30 + ((i * 13) % 35)}%` }} />
            </div>
          ))}
        </div>
      ) : artists.isError ? (
        <LoadError error={artists.error} />
      ) : artists.data.length === 0 ? (
        <Empty>No artists yet.</Empty>
      ) : (
        // The card holds still and the names fade in, where the placeholder rows were.
        <div className="print rounded-lg px-5 py-2 shadow-[0_1px_2px_rgb(0_0_0/0.14)]">
          <ul className="animate-arrive grid gap-x-8 sm:grid-cols-2 xl:grid-cols-3">
            {artists.data.map((artist) => (
              <li key={artist.id} className="border-b">
                <Link href={`/artists/${artist.id}`} className="hover:bg-accent -mx-2 flex items-center gap-3 rounded-md px-2 py-2">
                  <Cover type="artist" id={artist.id} size={80} className="size-9" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{artist.name}</span>
                  <span className="text-muted-foreground text-xs tabular-nums">{count(artist.albumCount, "album")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Page>
  );
}
