"use client";

import { useQuery } from "@tanstack/react-query";
import { PlayKey } from "~/components/library/play-key";
import { TrackTable, TrackTableSkeleton } from "~/components/library/track-table";
import { Page } from "~/components/shell/page";
import { Empty, LoadError } from "~/components/shell/states";
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
<PlayKey from="liked" tracks={tracks} size="sm" />
      }
    >
      {liked.isPending ? (
        <TrackTableSkeleton covers />
      ) : liked.isError ? (
        <LoadError error={liked.error} />
      ) : tracks.length === 0 ? (
        <Empty>Nothing liked yet. Give a heart to anything you would play twice.</Empty>
      ) : (
        <TrackTable tracks={tracks} showAlbum showCover from="liked" />
      )}
    </Page>
  );
}
