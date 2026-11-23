"use client";

import Link from "next/link";
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";

import { AlbumGrid, AlbumGridSkeleton } from "~/components/library/album-grid";
import { Page } from "~/components/shell/page";
import { Empty, LoadError } from "~/components/shell/states";
import { Button } from "~/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { useTRPC } from "~/trpc/react";

const sorts = {
  added: "Recently added",
  name: "Name",
  artist: "Artist",
  year: "Year",
  recent: "Recently played",
  frequent: "Most played",
} as const;
type Sort = keyof typeof sorts;

/** Every album the user can reach, as a grid, a page at a time. */
export function AlbumsView({ isAdmin }: { isAdmin: boolean }) {
  const trpc = useTRPC();
  const [sort, setSort] = useState<Sort>("added");
  const albums = useInfiniteQuery(
    trpc.library.albums.infiniteQueryOptions({ sort }, { getNextPageParam: (last) => last.nextCursor }),
  );
  const items = albums.data?.pages.flatMap((page) => page.items) ?? [];
  const byPlays = sort === "recent" || sort === "frequent";

  return (
    <Page
      actions={
        <Select value={sort} onValueChange={(value) => setSort(value as Sort)}>
          <SelectTrigger size="sm" aria-label="Sort albums" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {Object.entries(sorts).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >

      {albums.isPending ? (
        <AlbumGridSkeleton />
      ) : albums.isError ? (
        <LoadError error={albums.error} />
      ) : items.length === 0 ? (
        byPlays ? (
          <Empty>Nothing played yet. This fills in as you listen.</Empty>
        ) : isAdmin ? (
          <Empty
            action={
              <Button asChild variant="brand">
                <Link href="/admin/libraries">Add a library</Link>
              </Button>
            }
          >
            The crate is empty. Point it at a folder of music and it fills itself.
          </Empty>
        ) : (
          <Empty>The crate is empty. Ask whoever runs this server for a library.</Empty>
        )
      ) : (
        <>
          <AlbumGrid albums={items} />
          {albums.hasNextPage ? (
            <div className="mt-8 flex justify-center">
              <Button variant="outline" disabled={albums.isFetchingNextPage} onClick={() => albums.fetchNextPage()}>
                Show more
              </Button>
            </div>
          ) : null}
        </>
      )}
    </Page>
  );
}
