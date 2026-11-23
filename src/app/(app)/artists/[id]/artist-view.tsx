"use client";

import { useQuery } from "@tanstack/react-query";
import { Play } from "lucide-react";

import { AlbumGrid, AlbumGridSkeleton } from "~/components/library/album-grid";
import { TrackTable } from "~/components/library/track-table";
import { usePlayer } from "~/components/player/store";
import { PageCrumb } from "~/components/shell/crumb";
import { Page } from "~/components/shell/page";
import { LoadError, SectionHeading } from "~/components/shell/states";
import { Button } from "~/components/ui/button";
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

  return (
    <Page
      detail={artist.data ? `${count(artist.data.albums.length, "album")}, ${count(tracks.length, "track")}` : null}
      actions={
        <Button variant="brand" size="sm" disabled={!tracks.length} onClick={() => usePlayer.getState().play(tracks)}>
          <Play className="fill-current" />
          Play
        </Button>
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
            <AlbumGrid albums={artist.data.albums} />
          </section>
          {tracks.length ? (
            <section>
              <SectionHeading title="Tracks" />
              <TrackTable tracks={tracks} showAlbum showCover />
            </section>
          ) : null}
        </>
      )}
    </Page>
  );
}
