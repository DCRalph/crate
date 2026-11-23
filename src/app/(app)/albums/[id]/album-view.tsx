"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ListEnd } from "lucide-react";
import { toast } from "sonner";

import { Cover } from "~/components/library/cover";
import { RecordLayout, RecordSkeleton, type Fact } from "~/components/library/hero";
import { TrackTable, TrackTableSkeleton } from "~/components/library/track-table";
import { usePlayer, usePlayingFrom } from "~/components/player/store";
import { PageCrumb } from "~/components/shell/crumb";
import { Page } from "~/components/shell/page";
import { LoadError } from "~/components/shell/states";
import { Button } from "~/components/ui/button";
import { count, formatLength } from "~/lib/format";
import type { WebTrack } from "~/server/api/routers/library";
import { useTRPC } from "~/trpc/react";

/** What an album's files are, in a few words: "FLAC", "MP3 · 320 kbps", or the kinds there are when they differ. */
function formatOf(tracks: WebTrack[]) {
  const kinds = [...new Set(tracks.map((track) => track.suffix.toUpperCase()))];
  if (kinds.length !== 1) return kinds.join(", ");
  const rates = [...new Set(tracks.map((track) => track.bitRate))];
  const rate = rates.length === 1 ? rates[0] : null;
  return rate && kinds[0] !== "FLAC" && kinds[0] !== "WAV" && kinds[0] !== "AIFF" ? `${kinds[0]} · ${rate} kbps` : kinds[0];
}

/**
 * One album: its cover, what it is, and its tracks. The cover is there from
 * the first moment, before anything else is known. It asks for the size the
 * tiles use, which the browser already has.
 */
export function AlbumView({ id }: { id: number }) {
  const trpc = useTRPC();
  const album = useQuery(trpc.library.album.queryOptions({ id }));
  const { enqueue } = usePlayer.getState();
  const from = `album:${id}`;
  const { sounding } = usePlayingFrom(from);
  const cover = <Cover type="album" id={id} size={400} glow={sounding ? "lit" : true} className="w-full" />;

  if (album.isError) {
    return (
      <Page maxWidth="max-w-6xl" title="trail">
        <LoadError error={album.error} />
      </Page>
    );
  }
  const data = album.data;
  const facts: Fact[] = data
    ? [
        { label: "Artist", value: <Link href={`/artists/${data.artistId}`} className="hover:underline">{data.artistName}</Link> },
        ...(data.year ? [{ label: "Year", value: data.year }] : []),
        ...(data.genre ? [{ label: "Genre", value: data.genre }] : []),
        ...(data.tracks.length ? [{ label: "Format", value: formatOf(data.tracks) }] : []),
        { label: "Added", value: data.createdAt.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) },
      ]
    : [];

  return (
    <Page maxWidth="max-w-6xl" title="trail">
      {data ? <PageCrumb label={data.name} /> : null}
      {data ? (
        <RecordLayout
          cover={cover}
          from={from}
          tracks={data.tracks}
          title={data.name}
          facts={facts}
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
          keys={
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
          }
        >
          <TrackTable tracks={data.tracks} from={from} />
        </RecordLayout>
      ) : (
        <RecordSkeleton cover={cover} list={<TrackTableSkeleton />} />
      )}
    </Page>
  );
}
