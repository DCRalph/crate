"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ListEnd, Pencil, Play } from "lucide-react";
import { toast } from "sonner";

import { Cover } from "~/components/library/cover";
import { TrackTable, TrackTableSkeleton } from "~/components/library/track-table";
import { usePlayer } from "~/components/player/store";
import { PageCrumb } from "~/components/shell/crumb";
import { Page } from "~/components/shell/page";
import { Empty, LoadError } from "~/components/shell/states";
import { Button } from "~/components/ui/button";
import { count, formatLength } from "~/lib/format";
import { useTRPC } from "~/trpc/react";

/** One playlist, for playing. Changing it happens on its Edit page; ones that follow a folder on disk can only be copied. */
export function PlaylistView({ id }: { id: number }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const playlist = useQuery(trpc.playlists.byId.queryOptions({ id }));
  const { play, enqueue } = usePlayer.getState();

  const refresh = () => queryClient.invalidateQueries(trpc.playlists.pathFilter());
  const onError = (error: { message: string }) => toast.error(error.message);
  const removeTrack = useMutation(trpc.playlists.removeTrack.mutationOptions({ onSuccess: refresh, onError }));
  const copy = useMutation(
    trpc.playlists.duplicate.mutationOptions({
      onSuccess: async (copyId) => {
        await refresh();
        router.push(`/playlists/${copyId}/edit`);
      },
      onError,
    }),
  );

  if (playlist.isError) {
    return (
      <Page maxWidth="max-w-5xl">
        <LoadError message={playlist.error.message} />
      </Page>
    );
  }
  const data = playlist.data;
  if (!data) {
    return (
      <Page maxWidth="max-w-5xl">
        <TrackTableSkeleton />
      </Page>
    );
  }

  return (
    <Page maxWidth="max-w-5xl">
      <PageCrumb label={data.name} />
      <div className="mb-6 flex flex-col gap-5 sm:flex-row sm:items-end">
        <Cover type="playlist" id={id} size={480} className="w-40 sm:w-48" />
        <div className="min-w-0">
          <h1 className="font-title text-2xl font-semibold text-balance sm:text-3xl">{data.name}</h1>
          <p className="text-muted-foreground mt-1 text-sm tabular-nums">
            {[
              data.readOnly ? "Follows a folder on disk" : `By ${data.isMine ? "you" : data.ownerName}`,
              count(data.tracks.length, "track"),
              formatLength(data.duration),
              data.isPublic && !data.readOnly ? "Public" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {data.comment ? <p className="text-muted-foreground mt-2 max-w-prose text-sm">{data.comment}</p> : null}
          <div className="mt-4 flex flex-wrap items-center gap-2">
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
            {data.canEdit ? (
              <Button variant="outline" asChild>
                <Link href={`/playlists/${id}/edit`}>
                  <Pencil />
                  Edit
                </Link>
              </Button>
            ) : (
              <Button variant="outline" disabled={copy.isPending} onClick={() => copy.mutate({ id })}>
                <Copy />
                Make a copy
              </Button>
            )}
          </div>
        </div>
      </div>

      {data.tracks.length ? (
        <TrackTable
          tracks={data.tracks}
          showAlbum
          onRemove={data.canEdit ? (index) => removeTrack.mutate({ id, index }) : undefined}
        />
      ) : (
        <Empty>{data.canEdit ? "No tracks yet. Add some from any track's menu." : "No tracks."}</Empty>
      )}
    </Page>
  );
}
