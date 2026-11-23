"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Shuffle } from "lucide-react";

import { PlayKey } from "~/components/library/play-key";
import { TrackTable, TrackTableSkeleton } from "~/components/library/track-table";
import { usePlayer } from "~/components/player/store";
import { Page } from "~/components/shell/page";
import { Empty, LoadError } from "~/components/shell/states";
import { Button } from "~/components/ui/button";
import { count } from "~/lib/format";
import { defaultPlayRange, playRangeFrom, playRanges, type PlayRange } from "~/lib/most-played";
import { cn } from "~/lib/utils";
import type { WebTrack } from "~/server/api/routers/library";
import { useTRPC } from "~/trpc/react";

const labels: Record<PlayRange, string> = { "30d": "30 days", "90d": "90 days", all: "All time" };

/**
 * The user's own top 50 tracks over the last 30 days, 90 days or all time,
 * worked out from their plays. The range is kept in the address (?range=30d),
 * so Back finds the same list. Read only: the usual selection copies tracks
 * into a playlist.
 */
export function MostPlayedView() {
  const trpc = useTRPC();
  const router = useRouter();
  const pathname = usePathname();
  const range = playRangeFrom(useSearchParams().get("range"));
  const setRange = (next: PlayRange) => router.replace(next === defaultPlayRange ? pathname : `${pathname}?range=${next}`);
  const mostPlayed = useQuery(trpc.library.mostPlayed.queryOptions({ range }, { placeholderData: keepPreviousData }));
  const tracks = mostPlayed.data ?? [];
  const from = `most-played:${range}`;

  return (
    <Page
      maxWidth="max-w-5xl"
      detail={mostPlayed.data ? count(tracks.length, "track") : null}
      actions={
        <>
          <div role="group" aria-label="Played in" className="flex gap-1">
            {playRanges.map((option) => (
              <Button key={option} variant={option === range ? "default" : "outline"} size="sm" aria-pressed={option === range} onClick={() => setRange(option)}>
                {labels[option]}
              </Button>
            ))}
          </div>
          <ShuffleKey from={from} tracks={tracks} />
          <PlayKey from={from} tracks={tracks} size="sm" />
        </>
      }
    >
      {mostPlayed.isPending ? (
        <TrackTableSkeleton covers />
      ) : mostPlayed.isError ? (
        <LoadError error={mostPlayed.error} />
      ) : tracks.length === 0 ? (
        <Empty>{range === "all" ? "Nothing played yet. This fills in as you listen." : `Nothing played in the last ${labels[range]}.`}</Empty>
      ) : (
        <div className={cn("transition-opacity", mostPlayed.isPlaceholderData && "opacity-60")}>
          <TrackTable tracks={tracks} showAlbum showCover from={from} plays={(track) => track.plays} />
        </div>
      )}
    </Page>
  );
}

/** Plays the list in a random order, turning the queue's shuffle on as the deck's Shuffle key would. */
function ShuffleKey({ from, tracks }: { from: string; tracks: WebTrack[] }) {
  const shuffle = () => {
    const player = usePlayer.getState();
    if (player.lineup === null) player.toggleShuffle();
    player.play(tracks, undefined, from);
  };
  return (
    <Button variant="secondary" size="sm" disabled={!tracks.length} onClick={shuffle}>
      <Shuffle />
      Shuffle
    </Button>
  );
}
