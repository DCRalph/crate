"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { Cover } from "~/components/library/cover";
import { Page } from "~/components/shell/page";
import { Empty, LoadError, SectionHeading } from "~/components/shell/states";
import { Skeleton } from "~/components/ui/skeleton";
import { count } from "~/lib/format";
import { useTRPC } from "~/trpc/react";

/** Every album artist, alphabetically. */
export function ArtistsView() {
  const trpc = useTRPC();
  const artists = useQuery(trpc.library.artists.queryOptions());

  return (
    <Page>
      <SectionHeading title="All artists" detail={artists.data ? count(artists.data.length, "artist") : null} />
      {artists.isPending ? (
        <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : artists.isError ? (
        <LoadError message={artists.error.message} />
      ) : artists.data.length === 0 ? (
        <Empty>No artists yet.</Empty>
      ) : (
        <ul className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
          {artists.data.map((artist) => (
            <li key={artist.id} className="border-b">
              <Link href={`/artists/${artist.id}`} className="hover:bg-accent/50 -mx-2 flex items-center gap-3 rounded-md px-2 py-2">
                <Cover type="artist" id={artist.id} size={80} className="size-9 rounded-full" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{artist.name}</span>
                <span className="text-muted-foreground text-xs tabular-nums">{count(artist.albumCount, "album")}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
