"use client";

import { useQuery } from "@tanstack/react-query";

import { AlbumGrid, AlbumGridSkeleton } from "~/components/library/album-grid";
import { PageCrumb } from "~/components/shell/crumb";
import { Page } from "~/components/shell/page";
import { LoadError, SectionHeading } from "~/components/shell/states";
import { count } from "~/lib/format";
import { useTRPC } from "~/trpc/react";

/** One artist's albums, newest first. */
export function ArtistView({ id }: { id: number }) {
  const trpc = useTRPC();
  const artist = useQuery(trpc.library.artist.queryOptions({ id }));

  return (
    <Page>
      {artist.data ? <PageCrumb label={artist.data.name} /> : null}
      <SectionHeading title="Albums" detail={artist.data ? count(artist.data.albums.length, "album") : null} />
      {artist.isPending ? (
        <AlbumGridSkeleton count={6} />
      ) : artist.isError ? (
        <LoadError message={artist.error.message} />
      ) : (
        <AlbumGrid albums={artist.data.albums} showArtist={false} />
      )}
    </Page>
  );
}
