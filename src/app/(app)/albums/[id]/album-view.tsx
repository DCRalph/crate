"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ListEnd, Play } from "lucide-react";
import { toast } from "sonner";

import { Cover } from "~/components/library/cover";
import { Hero } from "~/components/library/hero";
import { TrackTable, TrackTableSkeleton } from "~/components/library/track-table";
import { usePlayer } from "~/components/player/store";
import { PageCrumb } from "~/components/shell/crumb";
import { Page } from "~/components/shell/page";
import { LoadError } from "~/components/shell/states";
import { Button } from "~/components/ui/button";
import { count, formatLength } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { HeroSkeleton } from "~/components/shell/skeletons";

/** One album: its cover, what it is, and its tracks. */
export function AlbumView({ id }: { id: number }) {
  const trpc = useTRPC();
  const album = useQuery(trpc.library.album.queryOptions({ id }));
  const { play, enqueue } = usePlayer.getState();

  if (album.isError) {
    return (
      <Page maxWidth="max-w-5xl">
        <LoadError error={album.error} />
      </Page>
    );
  }
  const data = album.data;

  return (
    <Page maxWidth="max-w-5xl" title="trail">
      {data ? <PageCrumb label={data.name} /> : null}
      {data ? (
        <Hero
          cover={<Cover type="album" id={id} size={480} className="w-40 sm:w-48" />}
          title={data.name}
          band={
            <>
              <Link href={`/artists/${data.artistId}`} className="hover:underline">
                {data.artistName}
              </Link>
              {[data.year, count(data.tracks.length, "track"), formatLength(data.duration)].filter(Boolean).map((fact) => (
                <span key={fact}>{fact}</span>
              ))}
            </>
          }
        >
          <Button variant="brand" disabled={!data.tracks.length} onClick={() => play(data.tracks)}>
            <Play className="fill-current" />
            Play
          </Button>
          <Button
            variant="outline"
            disabled={!data.tracks.length}
            onClick={() => {
              enqueue(data.tracks);
              toast(`Added to queue: ${data.name}`);
            }}
          >
            <ListEnd />
            Add to queue
          </Button>
        </Hero>
      ) : (
        <HeroSkeleton />
      )}
      {data ? <TrackTable tracks={data.tracks} /> : <TrackTableSkeleton />}
    </Page>
  );
}
