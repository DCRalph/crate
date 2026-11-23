"use client";

import { useQuery } from "@tanstack/react-query";
import { AlbumGrid, AlbumGridSkeleton } from "~/components/library/album-grid";
import { PlayKey } from "~/components/library/play-key";
import { TrackTable } from "~/components/library/track-table";
import { PageCrumb } from "~/components/shell/crumb";
import { Page } from "~/components/shell/page";
import { LoadError, SectionHeading } from "~/components/shell/states";
import { count } from "~/lib/format";
import { useTRPC } from "~/trpc/react";

/**
 * One artist: every album they are on, newest first, then every track they
 * are credited on. Some albums are filed under someone else, so each tile
 * names its artist.
 */
export function ArtistView({ id }: { id: number }) {
  const trpc = useTRPC();
  const artist = useQuery(trpc.library.artist.queryOptions({ id }));
  const tracks = artist.data?.tracks ?? [];
  const from = `artist:${id}`;

  return (
    <Page
      detail={artist.data ? `${count(artist.data.albums.length, "album")}, ${count(tracks.length, "track")}` : null}
      actions={
<PlayKey from={from} tracks={tracks} size="sm" />
      }
      className="flex flex-col gap-8"
    >
      {artist.data ? <PageCrumb label={artist.data.name} /> : null}
      {artist.isPending ? (
        <AlbumGridSkeleton count={6} />
      ) : artist.isError ? (
        <LoadError error={artist.error} />
      ) : (
        <>
          <section>
            <SectionHeading title="Albums" />
            {/* The tracks below are the numbered list here. */}
            <AlbumGrid albums={artist.data.albums} numbered={!tracks.length} />
          </section>
          {tracks.length ? (
            <section>
              <SectionHeading title="Tracks" />
              <TrackTable tracks={tracks} showAlbum showCover from={from} />
            </section>
          ) : null}
        </>
      )}
    </Page>
  );
}
