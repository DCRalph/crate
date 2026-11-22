"use client";

import { Fragment } from "react";
import { useQuery } from "@tanstack/react-query";

import { Fact, Facts, FactsSkeleton, formatSize, InfoDialog } from "~/components/library/info-dialog";
import { LoadError } from "~/components/shell/states";
import { formatDate, formatLength } from "~/lib/format";
import { useTRPC, type RouterOutputs } from "~/trpc/react";

type PlaylistInfo = RouterOutputs["info"]["playlist"];

const number = new Intl.NumberFormat("en");

/** Which folder on disk a playlist follows, as far as this person may know. */
function fromDisk({ fromDisk: follows, source }: PlaylistInfo) {
  if (!follows) return "No";
  if (!source) return "Yes";
  return source.path ? `${source.path} in ${source.libraryName}` : `All of ${source.libraryName}`;
}

/**
 * Get info for a playlist: who owns it, where it sits, who sees it, and
 * what is in it. The name comes from whatever opened it; the rest is fetched
 * when it opens.
 */
export function PlaylistInfoDialog({
  playlist,
  open,
  onOpenChange,
}: {
  playlist: { id: number; name: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <InfoDialog open={open} onOpenChange={onOpenChange} title={playlist.name}>
      <PlaylistFacts id={playlist.id} />
    </InfoDialog>
  );
}

function PlaylistFacts({ id }: { id: number }) {
  const trpc = useTRPC();
  // A playlist changes as tracks are added from other pages, so each opening asks again.
  const info = useQuery(trpc.info.playlist.queryOptions({ id }, { staleTime: 0 }));

  if (info.isError) return <LoadError message={info.error.message} />;
  const data = info.data;
  if (!data) return <FactsSkeleton rows={10} />;

  return (
    <Facts>
      <Fact label="Description">{data.comment}</Fact>
      <Fact label="Owner">{data.isMine ? "You" : data.ownerName}</Fact>
      <Fact label="Folder">{data.folderPath ?? "None"}</Fact>
      <Fact label="Public">{data.isPublic ? "Yes" : "No"}</Fact>
      <Fact label="From disk">
        <span className="break-all">{fromDisk(data)}</span>
      </Fact>
      <Fact label="Tracks">{number.format(data.trackCount)}</Fact>
      <Fact label="Length">{formatLength(data.duration)}</Fact>
      <Fact label="Size">{formatSize(data.size)}</Fact>
      <Fact label="Formats">
        {data.formats.length
          ? data.formats.map((format, index) => (
              <Fragment key={format.suffix}>
                {index ? ", " : null}
                <span className="uppercase">{format.suffix}</span> {number.format(format.tracks)}
              </Fragment>
            ))
          : null}
      </Fact>
      <Fact label="Created">{formatDate(data.createdAt)}</Fact>
      <Fact label="Changed">{formatDate(data.updatedAt)}</Fact>
    </Facts>
  );
}
