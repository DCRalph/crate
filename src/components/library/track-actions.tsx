"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentType, ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Disc3, Download, Info, ListEnd, ListPlus, ListStart, MicVocal, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { usePlayer } from "~/components/player/store";
import { ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger } from "~/components/ui/context-menu";
import { DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from "~/components/ui/dropdown-menu";
import { count } from "~/lib/format";
import type { WebTrack } from "~/server/api/routers/library";
import { useTRPC } from "~/trpc/react";
import { usePendingTracks } from "./pending-tracks";

/**
 * The parts a menu is built from. The same actions go in the menu behind a
 * row's button and in the one a right-click brings up; the two are different
 * components with the same shape, so the actions are written once against this.
 */
export type MenuKit = {
  Item: ComponentType<{ children: ReactNode; onSelect?: () => void; disabled?: boolean; asChild?: boolean }>;
  Separator: ComponentType;
  Sub: ComponentType<{ children: ReactNode }>;
  SubTrigger: ComponentType<{ children: ReactNode }>;
  SubContent: ComponentType<{ children: ReactNode; className?: string }>;
};
export const dropdownKit: MenuKit = {
  Item: DropdownMenuItem,
  Separator: DropdownMenuSeparator,
  Sub: DropdownMenuSub,
  SubTrigger: DropdownMenuSubTrigger,
  SubContent: DropdownMenuSubContent,
};
export const contextKit: MenuKit = {
  Item: ContextMenuItem,
  Separator: ContextMenuSeparator,
  Sub: ContextMenuSub,
  SubTrigger: ContextMenuSubTrigger,
  SubContent: ContextMenuSubContent,
};

/** Tracks to act on, fetched when the action is chosen. A list the page already has resolves at once. */
type Tracks = () => Promise<WebTrack[]>;

/**
 * "New playlist" and every playlist the person can add to. `label` is what
 * the tracks are called in the messages: a title, or "12 tracks".
 */
export function AddToPlaylistItems({ kit, tracks, label }: { kit: MenuKit; tracks: Tracks; label: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  // These are only mounted while a menu is open, so the list is asked for when someone looks, not once a row.
  const playlists = useQuery(trpc.playlists.list.queryOptions());
  const add = useMutation(
    trpc.playlists.addTracks.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.playlists.pathFilter()),
      onError: (error) => toast.error(error.message),
    }),
  );
  const editable = playlists.data?.filter((playlist) => playlist.isMine && !playlist.readOnly) ?? [];
  /** Runs once the tracks are in hand, and says so if they can't be fetched or there are none. */
  const withTracks = async (then: (found: WebTrack[]) => void) => {
    const found = await tracks().catch(() => null);
    if (!found) return void toast.error(`Couldn't get ${label}.`);
    if (!found.length) return void toast(`Nothing to add from ${label}.`);
    then(found);
  };

  return (
    <>
      {/* The tracks wait while the person names the playlist on its own page. */}
      <kit.Item
        onSelect={() =>
          void withTracks((found) => {
            usePendingTracks.getState().set(
              found.map((track) => track.id),
              label,
            );
            router.push("/playlists/new");
          })
        }
      >
        <Plus />
        New playlist
      </kit.Item>
      {playlists.isPending ? <kit.Item disabled>Loading playlists</kit.Item> : null}
      {editable.length ? <kit.Separator /> : null}
      {editable.map((playlist) => (
        <kit.Item
          key={playlist.id}
          onSelect={() =>
            void withTracks((found) =>
              add.mutate({ id: playlist.id, trackIds: found.map((track) => track.id) }, { onSuccess: () => toast(`Added ${label} to ${playlist.name}`) }),
            )
          }
        >
          <span className="truncate">{playlist.name}</span>
        </kit.Item>
      ))}
    </>
  );
}

/** Play next, add to queue and add to playlist, for anything that is a list of tracks: one track, a selection, an album, a playlist. */
export function QueueActions({ kit, tracks, label }: { kit: MenuKit; tracks: Tracks; label: string }) {
  const queue = async (how: "playNext" | "enqueue", said: string) => {
    const found = await tracks().catch(() => null);
    if (!found) return void toast.error(`Couldn't get ${label}.`);
    if (!found.length) return void toast(`${label} has no tracks.`);
    usePlayer.getState()[how](found);
    toast(`${said}: ${label}`);
  };
  return (
    <>
      <kit.Item onSelect={() => void queue("playNext", "Playing next")}>
        <ListStart />
        Play next
      </kit.Item>
      <kit.Item onSelect={() => void queue("enqueue", "Added to queue")}>
        <ListEnd />
        Add to queue
      </kit.Item>
      <kit.Sub>
        <kit.SubTrigger>
          <ListPlus />
          Add to playlist
        </kit.SubTrigger>
        <kit.SubContent className="max-h-72 w-52 overflow-y-auto">
          <AddToPlaylistItems kit={kit} tracks={tracks} label={label} />
        </kit.SubContent>
      </kit.Sub>
    </>
  );
}

/**
 * Everything that can be done with one track or with several chosen
 * together. One track also leads to its album and artist, can be downloaded
 * (when its library allows) and has its info. `onRemove` adds taking them
 * out of the playlist they are being looked at in.
 */
export function TrackActions({ kit, tracks, onInfo, onRemove }: { kit: MenuKit; tracks: WebTrack[]; onInfo?: (track: WebTrack) => void; onRemove?: () => void }) {
  const only = tracks.length === 1 ? tracks[0] : undefined;
  const label = only ? only.title : count(tracks.length, "track");
  return (
    <>
      <QueueActions kit={kit} tracks={async () => tracks} label={label} />
      {only ? (
        <>
          <kit.Item asChild>
            <Link href={`/albums/${only.albumId}`}>
              <Disc3 />
              Go to album
            </Link>
          </kit.Item>
          <kit.Item asChild>
            <Link href={`/artists/${only.artistId}`}>
              <MicVocal />
              Go to artist
            </Link>
          </kit.Item>
          {only.canDownload ? (
            <kit.Item asChild>
              <a href={`/api/download/${only.id}`} download>
                <Download />
                Download
              </a>
            </kit.Item>
          ) : null}
          {onInfo ? (
            <kit.Item onSelect={() => onInfo(only)}>
              <Info />
              Get info
            </kit.Item>
          ) : null}
        </>
      ) : null}
      {onRemove ? (
        <>
          <kit.Separator />
          <kit.Item onSelect={onRemove}>
            <Trash2 />
            Remove from playlist
          </kit.Item>
        </>
      ) : null}
    </>
  );
}
