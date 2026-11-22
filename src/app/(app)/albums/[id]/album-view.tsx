"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ListEnd, Play } from "lucide-react";
import { toast } from "sonner";

import { Cover } from "~/components/library/cover";
import { TrackTable, TrackTableSkeleton } from "~/components/library/track-table";
import { usePlayer } from "~/components/player/store";
import { PageCrumb } from "~/components/shell/crumb";
import { Page } from "~/components/shell/page";
import { LoadError } from "~/components/shell/states";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { count, formatLength } from "~/lib/format";
import { useTRPC } from "~/trpc/react";

/** One album: its cover, what it is, and its tracks. */
export function AlbumView({ id }: { id: number }) {
  const trpc = useTRPC();
  const album = useQuery(trpc.library.album.queryOptions({ id }));
  const { play, enqueue } = usePlayer.getState();

  if (album.isError) {
    return (
      <Page maxWidth="max-w-5xl">
        <LoadError message={album.error.message} />
      </Page>
    );
  }
  const data = album.data;

  return (
    <Page maxWidth="max-w-5xl">
      {data ? <PageCrumb label={data.name} /> : null}
      <div className="mb-6 flex flex-col gap-5 sm:flex-row sm:items-end">
        {data ? <Cover type="album" id={id} size={480} className="w-40 sm:w-48" /> : <Skeleton className="aspect-square w-40 sm:w-48" />}
        {data ? (
          <div className="min-w-0">
            <h1 className="font-title text-2xl font-semibold text-balance sm:text-3xl">{data.name}</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              <Link href={`/artists/${data.artistId}`} className="text-foreground hover:underline">
                {data.artistName}
              </Link>
              <span className="tabular-nums">
                {[data.year, count(data.tracks.length, "track"), formatLength(data.duration)].filter(Boolean).map((fact) => ` · ${fact}`)}
              </span>
            </p>
            <div className="mt-4 flex gap-2">
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
            </div>
          </div>
        ) : null}
      </div>
      {data ? <TrackTable tracks={data.tracks} numbering="track" /> : <TrackTableSkeleton />}
    </Page>
  );
}
