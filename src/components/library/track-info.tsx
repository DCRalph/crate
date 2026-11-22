"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { LoadError } from "~/components/shell/states";
import { count, formatDate, formatDuration, timeAgo } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { Fact, Facts, FactsSkeleton, formatSize, InfoDialog } from "./info-dialog";

const number = new Intl.NumberFormat("en");

/** ReplayGain as tagged: "-6.20 dB, peak 0.988". */
const gain = (db: number | null, peak: number | null) =>
  db === null ? null : `${db > 0 ? "+" : ""}${db.toFixed(2)} dB${peak === null ? "" : `, peak ${peak.toFixed(3)}`}`;

/**
 * Get info for a track: everything the library knows about it, and this
 * person's own plays and like. The title and artist come from the row that
 * opened it, so they are there at once; the rest is fetched when it opens.
 */
export function TrackInfoDialog({
  track,
  open,
  onOpenChange,
}: {
  track: { id: number; title: string; artistName: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <InfoDialog open={open} onOpenChange={onOpenChange} title={track.title} description={track.artistName}>
      <TrackFacts id={track.id} onLeave={() => onOpenChange(false)} />
    </InfoDialog>
  );
}

function TrackFacts({ id, onLeave }: { id: number; onLeave: () => void }) {
  const trpc = useTRPC();
  // Plays and likes change while the page is open, so each opening asks again.
  const info = useQuery(trpc.info.track.queryOptions({ id }, { staleTime: 0 }));

  if (info.isError) return <LoadError message={info.error.message} />;
  const data = info.data;
  if (!data) return <FactsSkeleton rows={12} />;

  return (
    <Facts>
      <Fact label="Album">
        {/* Closed on the way out, for when the album is the page already open. */}
        <Link href={`/albums/${data.albumId}`} onClick={onLeave} className="underline underline-offset-2 hover:no-underline">
          {data.albumName}
        </Link>
      </Fact>
      <Fact label="Track">{data.trackNumber}</Fact>
      <Fact label="Disc">{data.discNumber}</Fact>
      <Fact label="Year">{data.year}</Fact>
      <Fact label="Genre">{data.genre}</Fact>
      <Fact label="Length">{formatDuration(data.duration)}</Fact>
      <Fact label="Format">
        <span className="uppercase">{data.suffix}</span>
      </Fact>
      <Fact label="Bit rate">{data.bitRate ? `${number.format(data.bitRate)} kbps` : null}</Fact>
      <Fact label="Size">{formatSize(data.size)}</Fact>
      <Fact label="Library">{data.libraryName}</Fact>
      <Fact label="Path">
        <span className="break-all">{data.relPath}</span>
      </Fact>
      {data.path ? (
        <Fact label="On server">
          <span className="break-all">{data.path}</span>
        </Fact>
      ) : null}
      <Fact label="Added">{formatDate(data.addedAt)}</Fact>
      <Fact label="Track gain">{gain(data.trackGain, data.trackPeak)}</Fact>
      <Fact label="Album gain">{gain(data.albumGain, data.albumPeak)}</Fact>
      <Fact label="Played">{data.playCount ? `${count(data.playCount, "play")}, last ${timeAgo(data.lastPlayedAt)}` : "Never"}</Fact>
      <Fact label="Liked">{data.likedAt ? `Yes, since ${formatDate(data.likedAt)}` : "No"}</Fact>
    </Facts>
  );
}
