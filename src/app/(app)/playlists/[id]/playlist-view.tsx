"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  Image as ImageIcon,
  Info,
  ListEnd,
  MoreHorizontal,
  Pencil,
  Pin,
} from "lucide-react";
import { toast } from "sonner";

import { Cover } from "~/components/library/cover";
import { usePin } from "~/components/playlists/use-pin";
import { RecordLayout, RecordSkeleton } from "~/components/library/hero";
import {
  TrackTable,
  TrackTableSkeleton,
} from "~/components/library/track-table";
import { usePlayer, usePlayingFrom } from "~/components/player/store";
import { PlaylistInfoDialog } from "~/components/playlists/playlist-info";
import { PageCrumb } from "~/components/shell/crumb";
import { Page } from "~/components/shell/page";
import { Empty, LoadError } from "~/components/shell/states";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { sharedNote } from "~/lib/audience";
import { count, formatLength } from "~/lib/format";
import { useTRPC } from "~/trpc/react";

/** One playlist, for playing. Changing it happens on its Edit page; ones that follow a folder on disk can only be copied. */
export function PlaylistView({ id }: { id: number }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const playlist = useQuery(trpc.playlists.byId.queryOptions({ id }));
  const { enqueue } = usePlayer.getState();
  const from = `playlist:${id}`;
  // The cover's address changes with the cover, so until the playlist has loaded it is only known if the list of playlists is in hand.
  const coverKey =
    playlist.data?.coverKey ??
    queryClient
      .getQueryData(trpc.playlists.tree.queryKey())
      ?.playlists.find((row) => row.id === id)?.coverKey;
  const { sounding } = usePlayingFrom(from);
  const cover = coverKey ? <Cover type="playlist" id={id} version={coverKey} size={400} glow={sounding ? "lit" : true} className="w-full" /> : undefined;
  const togglePin = usePin();
  const [infoOpen, setInfoOpen] = useState(false);

  const refresh = () =>
    queryClient.invalidateQueries(trpc.playlists.pathFilter());
  const onError = (error: { message: string }) => toast.error(error.message);
  // One at a time and in order, so a second removal is counted against the list the first one left.
  const removeTrack = useMutation(
    trpc.playlists.removeTrack.mutationOptions({
      scope: { id: "playlist-tracks" },
      onError,
      onSettled: refresh,
    }),
  );
  /** Takes a row out at once, then tells the server which track it was, so a list that has moved on can't lose a different one. */
  const remove = (index: number) => {
    const track = playlist.data?.tracks[index];
    if (!track) return;
    queryClient.setQueryData(
      trpc.playlists.byId.queryKey({ id }),
      (old) =>
        old && { ...old, tracks: old.tracks.filter((_, i) => i !== index) },
    );
    removeTrack.mutate(
      { id, index, trackId: track.id },
      { onSuccess: () => toast(`Removed ${track.title}`) },
    );
  };
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
      <Page maxWidth="max-w-6xl" title="trail">
        <LoadError error={playlist.error} />
      </Page>
    );
  }
  const data = playlist.data;
  if (!data) {
    return (
      <Page maxWidth="max-w-6xl" title="trail">
        <RecordSkeleton cover={cover} list={<TrackTableSkeleton covers />} />
      </Page>
    );
  }

  return (
    <Page maxWidth="max-w-6xl" title="trail">
      <PageCrumb label={data.name} />
      <RecordLayout
        cover={cover ?? <Skeleton className="aspect-square rounded-[3px]" />}
        from={from}
        tracks={data.tracks}
        title={data.name}
        note={data.comment}
        band={[
          data.readOnly
            ? "Follows a folder on disk"
            : `By ${data.isMine ? "you" : data.ownerName}`,
          count(data.tracks.length, "track"),
          formatLength(data.duration),
          data.canShare ? sharedNote(data.audience) : null,
        ]
          .filter(Boolean)
          .map((fact) => (
            <span key={fact}>{fact}</span>
          ))}
        facts={[
          {
            label: "By",
            value: data.readOnly
              ? "A folder on disk"
              : data.isMine
                ? "You"
                : data.ownerName,
          },
          { label: "Tracks", value: count(data.tracks.length, "track") },
          { label: "Length", value: formatLength(data.duration) },
          {
            label: "Changed",
            value: data.updatedAt.toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            }),
          },
        ]}
        keys={
          <>
            <Button
              variant="outline"
              disabled={!data.tracks.length}
              onClick={() => {
                enqueue(data.tracks);
                toast(`Added to queue: ${data.name}`);
              }}
            >
              <ListEnd />
              {/* On a phone the keys keep to one row: these two show their sign alone. */}
              <span className="max-sm:sr-only">Add to queue</span>
            </Button>
            {data.canEdit ? (
              <Button variant="outline" asChild>
                <Link href={`/playlists/${id}/edit`}>
                  <Pencil />
                  <span className="max-sm:sr-only">Edit</span>
                </Link>
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="icon"
              aria-pressed={!!data.pinnedAt}
              aria-label={data.pinnedAt ? "Unpin" : "Pin to the top"}
              onClick={() => togglePin(data)}
            >
              <Pin
                className={
                  data.pinnedAt ? "text-brand fill-current" : undefined
                }
              />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={`More for ${data.name}`}
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuItem
                  disabled={copy.isPending}
                  onSelect={() => copy.mutate({ id })}
                >
                  <Copy />
                  Make a copy
                </DropdownMenuItem>
                {/* A playlist that follows the disk can't be edited, but its owner can still choose its cover. */}
                {data.canSetCover && !data.canEdit ? (
                  <DropdownMenuItem asChild>
                    <Link href={`/playlists/${id}/edit`}>
                      <ImageIcon />
                      Change cover
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onSelect={() => setInfoOpen(true)}>
                  <Info />
                  Get info
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      >
        {data.tracks.length ? (
          <TrackTable
            tracks={data.tracks}
            showAlbum
            showCover
            onRemove={data.canEdit ? remove : undefined}
            from={from}
          />
        ) : (
          <Empty>
            {data.canEdit
              ? "No tracks yet. Add some from any track's menu."
              : "No tracks."}
          </Empty>
        )}
      </RecordLayout>
      <PlaylistInfoDialog
        playlist={data}
        open={infoOpen}
        onOpenChange={setInfoOpen}
      />
    </Page>
  );
}
