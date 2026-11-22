"use client";

import { useQuery } from "@tanstack/react-query";

import { AlbumGrid, AlbumGridSkeleton } from "~/components/library/album-grid";
import { PageCrumb } from "~/components/shell/crumb";
import { Page } from "~/components/shell/page";
import { LoadError } from "~/components/shell/states";
import { count } from "~/lib/format";
import { useTRPC } from "~/trpc/react";

/** Every album one artist is on, newest first. Some are filed under someone else, so each tile names its artist. */
export function ArtistView({ id }: { id: number }) {
  const trpc = useTRPC();
  const artist = useQuery(trpc.library.artist.queryOptions({ id }));

  return (
    <Page detail={artist.data ? count(artist.data.albums.length, "album") : null}>
      {artist.data ? <PageCrumb label={artist.data.name} /> : null}
      {artist.isPending ? (
        <AlbumGridSkeleton count={6} />
      ) : artist.isError ? (
        <LoadError message={artist.error.message} />
      ) : (
        <AlbumGrid albums={artist.data.albums} />
      )}
    </Page>
  );
}
