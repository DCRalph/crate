"use client";

import { useQuery } from "@tanstack/react-query";
import { Play } from "lucide-react";

import { TrackTable, TrackTableSkeleton } from "~/components/library/track-table";
import { usePlayer } from "~/components/player/store";
import { Page } from "~/components/shell/page";
import { Empty, LoadError } from "~/components/shell/states";
import { Button } from "~/components/ui/button";
import { count } from "~/lib/format";
import { useTRPC } from "~/trpc/react";

/** Every track the user has given a heart, newest first. */
export function LikedView() {
  const trpc = useTRPC();
  const liked = useQuery(trpc.library.liked.queryOptions());
  const tracks = liked.data ?? [];

  return (
    <Page
      maxWidth="max-w-5xl"
      detail={liked.data ? count(tracks.length, "track") : null}
      actions={
        <Button variant="brand" size="sm" disabled={!tracks.length} onClick={() => usePlayer.getState().play(tracks)}>
          <Play className="fill-current" />
          Play
        </Button>
      }
    >
      {liked.isPending ? (
        <TrackTableSkeleton />
      ) : liked.isError ? (
        <LoadError message={liked.error.message} />
      ) : tracks.length === 0 ? (
        <Empty>Nothing liked yet. Give a heart to anything you would play twice.</Empty>
      ) : (
        <TrackTable tracks={tracks} showAlbum />
      )}
    </Page>
  );
}
