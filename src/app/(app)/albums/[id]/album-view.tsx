"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ListEnd } from "lucide-react";
import { toast } from "sonner";

import { Cover } from "~/components/library/cover";
import { Hero } from "~/components/library/hero";
import { TrackTable, TrackTableSkeleton } from "~/components/library/track-table";
import { usePlayer } from "~/components/player/store";
import { PageCrumb } from "~/components/shell/crumb";
import { Page } from "~/components/shell/page";
import { LoadError } from "~/components/shell/states";
import { SharedCover } from "~/components/shell/transitions";
import { Button } from "~/components/ui/button";
import { count, formatLength } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { HeroSkeleton } from "~/components/shell/skeletons";

/**
 * One album: its cover, what it is, and its tracks. The cover is there from
 * the first moment, before anything else is known, so it can travel over from
 * the tile that was clicked. It asks for the size the tiles use, which the
 * browser already has.
 */
export function AlbumView({ id }: { id: number }) {
  const trpc = useTRPC();
  const album = useQuery(trpc.library.album.queryOptions({ id }));
  const { enqueue } = usePlayer.getState();
  const from = `album:${id}`;
  const cover = (
    <SharedCover name={`album-${id}`}>
      <Cover type="album" id={id} size={400} />
    </SharedCover>
  );

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
          cover={cover}
          from={from}
          tracks={data.tracks}
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
          <Button
            variant="outline"
            disabled={!data.tracks.length}
            onClick={() => {
              enqueue(data.tracks);
              toast(`Added to queue: ${data.name}`);
            }}
          >
            <ListEnd />
            {/* On a phone the keys show their sign alone. */}
            <span className="max-sm:sr-only">Add to queue</span>
          </Button>
        </Hero>
      ) : (
        <HeroSkeleton cover={cover} />
      )}
      {data ? <TrackTable tracks={data.tracks} from={from} /> : <TrackTableSkeleton />}
    </Page>
  );
}
