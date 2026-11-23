"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";

import { AlbumGrid, AlbumGridSkeleton } from "~/components/library/album-grid";
import { Page } from "~/components/shell/page";
import { Empty, LoadError } from "~/components/shell/states";
import { Button } from "~/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { cn } from "~/lib/utils";
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

const isSort = (value: string | null): value is Sort => value !== null && value in sorts;

/**
 * Every album the user can reach, as a grid, a page at a time. The order is
 * kept in the address (?sort=name), so coming Back from an album finds the
 * same grid. Changing it leaves the old grid up, dimmed, until the new one is in.
 */
export function AlbumsView({ isAdmin }: { isAdmin: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const pathname = usePathname();
  const chosen = useSearchParams().get("sort");
  const sort: Sort = isSort(chosen) ? chosen : "added";
  const setSort = (next: Sort) => router.replace(next === "added" ? pathname : `${pathname}?sort=${next}`);
  const albums = useInfiniteQuery(
    trpc.library.albums.infiniteQueryOptions({ sort }, { getNextPageParam: (last) => last.nextCursor, placeholderData: keepPreviousData }),
  );
  const items = albums.data?.pages.flatMap((page) => page.items) ?? [];
  const byPlays = sort === "recent" || sort === "frequent";

  return (
    <Page
      actions={
        <Select value={sort} onValueChange={(value) => isSort(value) && setSort(value)}>
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
        <div className={cn("transition-opacity", albums.isPlaceholderData && "opacity-60")}>
          <AlbumGrid albums={items} />
          {albums.hasNextPage ? (
            <div className="mt-8 flex justify-center">
              <Button variant="outline" disabled={albums.isFetchingNextPage} onClick={() => albums.fetchNextPage()}>
                Show more
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </Page>
  );
}
