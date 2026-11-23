"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Disc3, Download, Info, ListEnd, ListPlus, ListStart, MicVocal, MoreHorizontal, Pause, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { rowNumber, useNumbered } from "~/components/player/selection";
import { useCurrentTrack, usePlayer } from "~/components/player/store";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { formatDuration } from "~/lib/format";
import { cn } from "~/lib/utils";
import type { WebTrack } from "~/server/api/routers/library";
import { useTRPC } from "~/trpc/react";
import { Cover } from "./cover";
import { LikeButton } from "./like-button";
import { usePendingTracks } from "./pending-tracks";
import { TrackInfoDialog } from "./track-info";
import { RowsSkeleton } from "~/components/shell/skeletons";

/**
 * The list of tracks on an album, playlist or search page, printed as a card.
 * Every row has a number and a lamp. Clicking the number plays from there, as
 * does double-clicking the row or typing the number and Enter. The lamp is
 * lit on the row that is playing, and that row's button pauses.
 *  - `showCover`: puts each track's album cover beside its title, for lists
 *    that mix albums. Off on an album's own page, where they'd all be the same.
 *  - `onRemove`: adds "Remove from playlist" to each row's menu.
 */
export function TrackTable({
  tracks,
  showAlbum = false,
  showCover = false,
  onRemove,
}: {
  tracks: WebTrack[];
  showAlbum?: boolean;
  showCover?: boolean;
  onRemove?: (index: number) => void;
}) {
  // One Get info dialog for the whole list. The track stays after closing, so the dialog doesn't empty as it fades.
  const [info, setInfo] = useState<{ track: WebTrack; open: boolean } | null>(null);
  const current = useCurrentTrack();
  const playing = usePlayer((state) => state.playing);
  const { play, setPlaying } = usePlayer.getState();
  useNumbered(tracks.length, (index) => play(tracks, index));

  return (
    <>
      <div className="print overflow-hidden rounded-lg shadow-[0_1px_2px_rgb(0_0_0/0.14)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[4.5rem] pl-4">No.</TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="max-md:hidden">Artist</TableHead>
              {showAlbum ? <TableHead className="max-lg:hidden">Album</TableHead> : null}
              <TableHead className="w-10" />
              <TableHead className="w-16 text-right">Time</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody className="animate-arrive">
            {tracks.map((track, index) => {
              const isCurrent = current?.id === track.id;
              // The playing row's button pauses and resumes; any other row starts the list from there.
              const start = () => (isCurrent ? setPlaying(!playing) : play(tracks, index));
              return (
                <TableRow
                  key={`${track.id}-${index}`}
                  className={cn("group select-none", isCurrent && "bg-muted hover:bg-muted font-semibold")}
                  // A double click on the heart, the menu or a link is two clicks on that, not a request to play the row.
                  onDoubleClick={(event) => {
                    if (!(event.target instanceof Element && event.target.closest("button, a"))) play(tracks, index);
                  }}
                >
                  <TableCell className="pl-4">
                    <button
                      type="button"
                      aria-label={isCurrent && playing ? `Pause ${track.title}` : `Play ${track.title}`}
                      onClick={start}
                      className="focus-visible:ring-ring/60 inline-flex h-6 items-center gap-2 rounded-sm outline-none focus-visible:ring-[3px]"
                    >
                      {/* Keyed, so the lamp pops once as it lights. */}
                      <span key={String(isCurrent)} className={cn("lamp", isCurrent && "animate-pop")} data-lit={isCurrent} aria-hidden />
                      <span className={cn("t-num w-5 text-left text-[15px] group-hover:hidden", isCurrent ? "text-foreground" : "text-muted-foreground")}>
                        {rowNumber(index)}
                      </span>
                      <span className="hidden w-5 group-hover:block">
                        {isCurrent && playing ? <Pause className="size-3.5 fill-current" /> : <Play className="size-3.5 fill-current" />}
                      </span>
                    </button>
                  </TableCell>
                  <TableCell className={cn("w-1/2 max-w-0", showCover && "py-1.5")}>
                    <div className="flex items-center gap-2.5">
                      {showCover ? <Cover type="album" id={track.albumId} size={64} className="size-8" /> : null}
                      <div className="min-w-0">
                        <p className="truncate">{track.title}</p>
                        <p className="text-muted-foreground truncate text-xs font-normal md:hidden">{track.artistName}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground w-1/4 max-w-0 truncate font-normal max-md:hidden">
                    <Link href={`/artists/${track.artistId}`} className="hover:text-foreground hover:underline">
                      {track.artistName}
                    </Link>
                  </TableCell>
                  {showAlbum ? (
                    <TableCell className="text-muted-foreground w-1/4 max-w-0 truncate font-normal max-lg:hidden">
                      <Link href={`/albums/${track.albumId}`} className="hover:text-foreground hover:underline">
                        {track.albumName}
                      </Link>
                    </TableCell>
                  ) : null}
                  <TableCell className="py-0">
                    {/* A liked heart always shows; an empty one waits for the row to be hovered or focused. */}
                    <LikeButton
                      track={track}
                      className={cn(!track.starred && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-pressed:opacity-100 pointer-coarse:opacity-100")}
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right font-normal tabular-nums">{formatDuration(track.duration)}</TableCell>
                  <TableCell className="py-0">
                    <TrackMenu track={track} onInfo={() => setInfo({ track, open: true })} onRemove={onRemove ? () => onRemove(index) : undefined} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {info ? <TrackInfoDialog track={info.track} open={info.open} onOpenChange={(open) => setInfo({ ...info, open })} /> : null}
    </>
  );
}

/** A row's actions: queue it, add it to a playlist, download it (when the library allows), and get info on it. */
export function TrackMenu({ track, onInfo, onRemove }: { track: WebTrack; onInfo: () => void; onRemove?: () => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { enqueue, playNext } = usePlayer.getState();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Only asked for once a menu is opened, not once per row.
  const playlists = useQuery(trpc.playlists.list.queryOptions(undefined, { enabled: open }));
  const add = useMutation(
    trpc.playlists.addTracks.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.playlists.pathFilter()),
      onError: (error) => toast.error(error.message),
    }),
  );
  const editable = playlists.data?.filter((playlist) => playlist.isMine && !playlist.readOnly) ?? [];

  return (
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`More for ${track.title}`}
            className="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            onSelect={() => {
              playNext([track]);
              toast(`Playing next: ${track.title}`);
            }}
          >
            <ListStart />
            Play next
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              enqueue([track]);
              toast(`Added to queue: ${track.title}`);
            }}
          >
            <ListEnd />
            Add to queue
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ListPlus />
              Add to playlist
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-72 w-52 overflow-y-auto">
              {/* The track waits while the person names the playlist on its own page. */}
              <DropdownMenuItem
                onSelect={() => {
                  usePendingTracks.getState().set([track.id], track.title);
                  router.push("/playlists/new");
                }}
              >
                <Plus />
                New playlist
              </DropdownMenuItem>
              {playlists.isPending ? <DropdownMenuItem disabled>Loading playlists</DropdownMenuItem> : null}
              {editable.length ? <DropdownMenuSeparator /> : null}
              {editable.map((playlist) => (
                <DropdownMenuItem
                  key={playlist.id}
                  onSelect={() =>
                    add.mutate({ id: playlist.id, trackIds: [track.id] }, { onSuccess: () => toast(`Added to ${playlist.name}`) })
                  }
                >
                  <span className="truncate">{playlist.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem asChild>
            <Link href={`/albums/${track.albumId}`}>
              <Disc3 />
              Go to album
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/artists/${track.artistId}`}>
              <MicVocal />
              Go to artist
            </Link>
          </DropdownMenuItem>
          {track.canDownload ? (
            <DropdownMenuItem asChild>
              <a href={`/api/download/${track.id}`} download>
                <Download />
                Download
              </a>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={onInfo}>
            <Info />
            Get info
          </DropdownMenuItem>
          {onRemove ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onRemove}>
                <Trash2 />
                Remove from playlist
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
  );
}

/** Static placeholder rows while a track list loads. */
export function TrackTableSkeleton({ rows = 8, covers = false }: { rows?: number; covers?: boolean }) {
  return <RowsSkeleton rows={rows} covers={covers} />;
}
