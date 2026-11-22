"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ListEnd, ListPlus, MoreHorizontal, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import { Skeleton } from "~/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { formatDuration } from "~/lib/format";
import { cn } from "~/lib/utils";
import type { WebTrack } from "~/server/api/routers/library";
import { useTRPC } from "~/trpc/react";
import { NewPlaylistDialog } from "./new-playlist-dialog";

/**
 * The list of tracks on an album, playlist or search page. Clicking a row's
 * number plays from there; double-clicking the row does the same.
 *  - `numbering`: "track" shows tag track numbers (albums), "position" counts from 1.
 *  - `onRemove`: adds "Remove from playlist" to each row's menu.
 */
export function TrackTable({
  tracks,
  numbering = "position",
  showAlbum = false,
  onRemove,
}: {
  tracks: WebTrack[];
  numbering?: "track" | "position";
  showAlbum?: boolean;
  onRemove?: (index: number) => void;
}) {
  const current = useCurrentTrack();
  const play = usePlayer((state) => state.play);

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="t-label text-muted-foreground w-10 text-right text-[10px]">#</TableHead>
          <TableHead className="t-label text-muted-foreground text-[10px]">Title</TableHead>
          <TableHead className="t-label text-muted-foreground text-[10px] max-md:hidden">Artist</TableHead>
          {showAlbum ? <TableHead className="t-label text-muted-foreground text-[10px] max-lg:hidden">Album</TableHead> : null}
          <TableHead className="t-label text-muted-foreground w-16 text-right text-[10px]">Time</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {tracks.map((track, index) => {
          const isCurrent = current?.id === track.id;
          return (
            <TableRow key={`${track.id}-${index}`} className="group" onDoubleClick={() => play(tracks, index)}>
              <TableCell className="text-right">
                <button
                  type="button"
                  aria-label={`Play ${track.title}`}
                  onClick={() => play(tracks, index)}
                  className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-grid size-6 place-items-center rounded-sm tabular-nums outline-none focus-visible:ring-[3px]"
                >
                  <span className={cn("group-hover:hidden", isCurrent && "text-brand-text")}>
                    {numbering === "track" ? (track.trackNumber ?? index + 1) : index + 1}
                  </span>
                  <Play className="hidden size-3.5 fill-current group-hover:block" />
                </button>
              </TableCell>
              <TableCell className="max-w-0 w-1/2">
                <p className={cn("truncate", isCurrent && "text-brand-text")}>{track.title}</p>
                <p className="text-muted-foreground truncate text-xs md:hidden">{track.artistName}</p>
              </TableCell>
              <TableCell className="text-muted-foreground max-w-0 w-1/4 truncate max-md:hidden">
                <Link href={`/artists/${track.artistId}`} className="hover:text-foreground hover:underline">
                  {track.artistName}
                </Link>
              </TableCell>
              {showAlbum ? (
                <TableCell className="text-muted-foreground max-w-0 w-1/4 truncate max-lg:hidden">
                  <Link href={`/albums/${track.albumId}`} className="hover:text-foreground hover:underline">
                    {track.albumName}
                  </Link>
                </TableCell>
              ) : null}
              <TableCell className="text-muted-foreground text-right tabular-nums">{formatDuration(track.duration)}</TableCell>
              <TableCell className="py-0">
                <TrackMenu track={track} onRemove={onRemove ? () => onRemove(index) : undefined} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** A row's actions: queue it, add it to a playlist, download it (when the library allows). */
function TrackMenu({ track, onRemove }: { track: WebTrack; onRemove?: () => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const enqueue = usePlayer((state) => state.enqueue);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
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
    <>
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
              <DropdownMenuItem onSelect={() => setCreating(true)}>
                <Plus />
                New playlist
              </DropdownMenuItem>
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
          {track.canDownload ? (
            <DropdownMenuItem asChild>
              <a href={`/api/download/${track.id}`} download>
                <Download />
                Download
              </a>
            </DropdownMenuItem>
          ) : null}
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
      <NewPlaylistDialog open={creating} onOpenChange={setCreating} trackIds={[track.id]} />
    </>
  );
}

/** Static placeholder rows while a track list loads. */
export function TrackTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2 pt-2">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}
