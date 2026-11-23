"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { AlbumGrid } from "~/components/library/album-grid";
import { Cover } from "~/components/library/cover";
import { TrackTable, TrackTableSkeleton } from "~/components/library/track-table";
import { Page } from "~/components/shell/page";
import { Empty, LoadError, SectionHeading } from "~/components/shell/states";
import { cn } from "~/lib/utils";
import { useTRPC } from "~/trpc/react";

/** Lower case with accents dropped, so "cafe" finds "Café". */
const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Results for the header's search box: artists, albums, playlists and tracks
 * matching ?q=. Playlists are few and already listed for the menus, so they
 * are matched here by name, every word having to appear.
 */
export function SearchView() {
  const trpc = useTRPC();
  const query = useSearchParams().get("q")?.trim() ?? "";
  const allPlaylists = useQuery(trpc.playlists.list.queryOptions(undefined, { enabled: query.length > 0 }));
  const words = fold(query).split(/\s+/);
  const playlists = (allPlaylists.data ?? []).filter((playlist) => words.every((word) => fold(playlist.name).includes(word)));
  const results = useQuery(
    // The last results stay up while the next letter's are fetched.
    trpc.library.search.queryOptions({ query }, { enabled: query.length > 0, placeholderData: keepPreviousData }),
  );

  if (!query) {
    return (
      <Page>
        <Empty>Search for an artist, album, playlist or track.</Empty>
      </Page>
    );
  }
  if (results.isError) {
    return (
      <Page>
        <LoadError error={results.error} />
      </Page>
    );
  }
  const found = results.data;
  const nothing = found ? !found.artists.length && !found.albums.length && !found.tracks.length && !playlists.length : false;
  // The last search's results stay up while the next loads, unless there were none: "nothing for daft" would be said before anyone had looked.
  if (!found || (results.isPlaceholderData && nothing)) {
    return (
      <Page>
        <TrackTableSkeleton covers />
      </Page>
    );
  }
  const { artists, albums, tracks } = found;
  if (nothing) {
    return (
      <Page>
        <Empty>Nothing in the crate for &quot;{query}&quot;. Try fewer words.</Empty>
      </Page>
    );
  }

  return (
    <Page className={cn("flex flex-col gap-8 transition-opacity", results.isPlaceholderData && "opacity-60")}>
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
      {playlists.length ? (
        <section>
          <SectionHeading title="Playlists" />
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {playlists.map((playlist) => (
              <li key={playlist.id}>
                <Link href={`/playlists/${playlist.id}`} className="flex items-center gap-2 text-sm font-medium hover:underline">
                  <Cover type="playlist" id={playlist.id} version={playlist.coverKey} size={80} className="size-8" />
                  {playlist.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {tracks.length ? (
        <section>
          <SectionHeading title="Tracks" />
          <TrackTable tracks={tracks} showAlbum showCover />
        </section>
      ) : null}
    </Page>
  );
}
