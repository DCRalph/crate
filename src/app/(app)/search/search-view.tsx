"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { AlbumGrid } from "~/components/library/album-grid";
import { Cover } from "~/components/library/cover";
import { TrackTable, TrackTableSkeleton } from "~/components/library/track-table";
import { Page } from "~/components/shell/page";
import { Empty, LoadError, SectionHeading } from "~/components/shell/states";
import { useTRPC } from "~/trpc/react";

/** Results for the header's search box: artists, albums and tracks matching ?q=. */
export function SearchView() {
  const trpc = useTRPC();
  const query = useSearchParams().get("q")?.trim() ?? "";
  const results = useQuery(
    // The last results stay up while the next letter's are fetched.
    trpc.library.search.queryOptions({ query }, { enabled: query.length > 0, placeholderData: keepPreviousData }),
  );

  if (!query) {
    return (
      <Page>
        <Empty>Search for an artist, album or track.</Empty>
      </Page>
    );
  }
  if (results.isError) {
    return (
      <Page>
        <LoadError message={results.error.message} />
      </Page>
    );
  }
  if (!results.data) {
    return (
      <Page>
        <TrackTableSkeleton />
      </Page>
    );
  }
  const { artists, albums, tracks } = results.data;
  if (!artists.length && !albums.length && !tracks.length) {
    return (
      <Page>
        <Empty>Nothing in the crate for &quot;{query}&quot;. Try fewer words.</Empty>
      </Page>
    );
  }

  return (
    <Page className="flex flex-col gap-8">
      {artists.length ? (
        <section>
          <SectionHeading title="Artists" />
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {artists.map((artist) => (
              <li key={artist.id}>
                <Link href={`/artists/${artist.id}`} className="flex items-center gap-2 text-sm font-medium hover:underline">
                  <Cover type="artist" id={artist.id} size={80} className="size-8" />
                  {artist.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {albums.length ? (
        <section>
          <SectionHeading title="Albums" />
          <AlbumGrid albums={albums} />
        </section>
      ) : null}
      {tracks.length ? (
        <section>
          <SectionHeading title="Tracks" />
          <TrackTable tracks={tracks} showAlbum />
        </section>
      ) : null}
    </Page>
  );
}
