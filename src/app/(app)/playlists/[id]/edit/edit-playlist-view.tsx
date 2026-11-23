"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, GripVertical, X } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "~/components/confirm-provider";
import { Cover } from "~/components/library/cover";
import { CoverPicker } from "~/components/playlists/cover-picker";
import { FolderSelect } from "~/components/playlists/folder-select";
import { PageCrumb } from "~/components/shell/crumb";
import { Field, FormActions, FormSection, SettingRow } from "~/components/shell/form";
import { Page } from "~/components/shell/page";
import { LoadError } from "~/components/shell/states";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";
import { Textarea } from "~/components/ui/textarea";
import { count, formatDuration } from "~/lib/format";
import { cn } from "~/lib/utils";
import { useTRPC, type RouterOutputs } from "~/trpc/react";
import { CardSkeleton } from "~/components/shell/skeletons";

type Playlist = RouterOutputs["playlists"]["byId"];

/** Everything about one playlist that can change: its name, where it sits, who sees it, and the order of its tracks. */
export function EditPlaylistView({ id }: { id: number }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const playlist = useQuery(trpc.playlists.byId.queryOptions({ id }));
  const refresh = () => queryClient.invalidateQueries(trpc.playlists.pathFilter());
  const onError = (error: { message: string }) => toast.error(error.message);
  const update = useMutation(trpc.playlists.update.mutationOptions({ onSuccess: refresh, onError }));
  const copy = useMutation(
    trpc.playlists.duplicate.mutationOptions({
      onSuccess: async (copyId) => {
        await refresh();
        router.push(`/playlists/${copyId}/edit`);
      },
      onError,
    }),
  );
  const remove = useMutation(
    trpc.playlists.delete.mutationOptions({
      // Not awaited: the page shows a placeholder from here until it has left (see below).
      onSuccess: () => {
        void refresh();
        router.push("/playlists");
      },
      onError,
    }),
  );

  // Deleted and on the way out. Asking for the playlist again would only say it isn't there.
  if (remove.isSuccess) {
    return (
      <Page maxWidth="max-w-4xl">
        <CardSkeleton sections={3} />
      </Page>
    );
  }
  if (playlist.isError) {
    return (
      <Page maxWidth="max-w-4xl">
        <LoadError error={playlist.error} />
      </Page>
    );
  }
  const data = playlist.data;
  if (!data) {
    return (
      <Page maxWidth="max-w-4xl">
        <CardSkeleton sections={3} />
      </Page>
    );
  }

  if (!data.canEdit) {
    return (
      <Page maxWidth="max-w-2xl" className="flex flex-col gap-6">
        <PageCrumb label={data.name} />
        <FormSection
          title={data.name}
          description={
            data.readOnly
              ? "This playlist follows a folder on disk, so it changes when the files do and can't be edited here. A copy is yours to change."
              : `This playlist belongs to ${data.ownerName}. A copy is yours to change.`
          }
        >
          <FormActions>
            <Button variant="brand" disabled={copy.isPending} onClick={() => copy.mutate({ id })}>
              Make a copy
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/playlists/${id}`}>Back to the playlist</Link>
            </Button>
          </FormActions>
        </FormSection>
        {/* How it looks is still the owner's to choose. */}
        {data.canSetCover ? <CoverPicker playlist={data} /> : null}
      </Page>
    );
  }

  return (
    <Page maxWidth="max-w-4xl" className="flex flex-col gap-6">
      <PageCrumb label={data.name} />

      {/* Keyed by what is saved, so the fields start from it again after each save. */}
      <Details key={`${data.name}\n${data.comment ?? ""}`} playlist={data} />

      <CoverPicker playlist={data} />

      <FormSection title="Place and sharing">
        <div className="grid gap-4">
          <Field label="Folder" htmlFor="playlist-folder">
            <FolderSelect
              id="playlist-folder"
              value={data.folderId}
              onChange={(folderId) => update.mutate({ id, folderId }, { onSuccess: () => toast(`Moved ${data.name}`) })}
            />
          </Field>
          <SettingRow label="Public" detail="Everyone can see it. They still only hear the tracks their libraries allow.">
            <Switch
              aria-label="Public"
              checked={data.isPublic}
              onCheckedChange={(isPublic) =>
                update.mutate({ id, isPublic }, { onSuccess: () => toast(isPublic ? "Everyone can see this playlist" : "Only you can see this playlist") })
              }
            />
          </SettingRow>
        </div>
      </FormSection>

      {/* Starts over when tracks come or go, not when they only change places: a move must keep its row, and the keyboard's place on it. */}
      <Tracks
        key={data.tracks
          .map((track) => track.id)
          .sort((a, b) => a - b)
          .join(",")}
        playlist={data}
      />

      <FormSection title="Copy or delete" description="A copy starts with the same tracks. Deleting removes the playlist; the tracks stay in the library.">
        <FormActions>
          <Button variant="outline" disabled={copy.isPending} onClick={() => copy.mutate({ id })}>
            Make a copy
          </Button>
          <Button
            variant="outline"
            disabled={remove.isPending}
            onClick={async () => {
              const ok = await confirm({
                title: `Delete ${data.name}?`,
                description: "The playlist goes. The tracks stay in the library.",
                confirmLabel: "Delete",
                variant: "destructive",
              });
              if (ok) remove.mutate({ id }, { onSuccess: () => toast(`Deleted ${data.name}`) });
            }}
          >
            Delete playlist
          </Button>
        </FormActions>
      </FormSection>
    </Page>
  );
}

function Details({ playlist }: { playlist: Playlist }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [name, setName] = useState(playlist.name);
  const [comment, setComment] = useState(playlist.comment ?? "");
  const save = useMutation(
    trpc.playlists.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.playlists.pathFilter());
        toast("Saved");
      },
    }),
  );
  const changed = name.trim() !== playlist.name || comment.trim() !== (playlist.comment ?? "");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({ id: playlist.id, name, comment });
      }}
    >
      <FormSection title="Details" className="grid gap-4">
        <Field label="Name" htmlFor="playlist-name" error={save.error?.message}>
          <Input id="playlist-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
        </Field>
        <Field label="Description" htmlFor="playlist-comment">
          <Textarea id="playlist-comment" value={comment} onChange={(event) => setComment(event.target.value)} maxLength={500} rows={2} />
        </Field>
        <FormActions>
          <Button type="submit" disabled={!name.trim() || !changed || save.isPending}>
            Save
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/playlists/${playlist.id}`}>Back to the playlist</Link>
          </Button>
        </FormActions>
      </FormSection>
    </form>
  );
}

/**
 * The tracks in order. Drag a row by its handle, or use the arrows, to move
 * it; each change is saved as it is made, one after another. The list is the
 * person's own copy of the order, and only goes back to the server's when a
 * save fails. Each row keeps the key it started with, so moving one doesn't
 * rebuild it and the arrow just pressed can be pressed again.
 */
function Tracks({ playlist }: { playlist: Playlist }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [order, setOrder] = useState(() => playlist.tracks.map((track, key) => ({ ...track, key })));
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const save = useMutation(
    trpc.playlists.setTracks.mutationOptions({
      scope: { id: "playlist-tracks" },
      onError: (error) => {
        toast.error(error.message);
        // Back to what the server has.
        setOrder(playlist.tracks.map((track, key) => ({ ...track, key })));
      },
      onSettled: () => queryClient.invalidateQueries(trpc.playlists.pathFilter()),
    }),
  );
  const apply = (next: typeof order) => {
    setOrder(next);
    save.mutate({ id: playlist.id, trackIds: next.map((track) => track.id) });
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    next.splice(to, 0, ...next.splice(from, 1));
    apply(next);
  };

  return (
    <FormSection
      title="Tracks"
      description={order.length ? `${count(order.length, "track")}. Drag a row or use its arrows to reorder.` : "No tracks yet. Add some from any track's menu."}
    >
      {order.length ? (
        <ol className="flex flex-col">
          {order.map((track, index) => (
            <li
              key={track.key}
              draggable
              onDragStart={(event) => {
                setDragging(index);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setOver(index);
              }}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragging !== null) move(dragging, index);
                setDragging(null);
                setOver(null);
              }}
              className={cn(
                "flex items-center gap-2 border-b py-1.5 text-sm last:border-b-0",
                dragging === index && "opacity-40",
                // A line on the edge the row will land against.
                over === index && dragging !== null && dragging !== index && (dragging < index ? "shadow-[inset_0_-2px_0_var(--brand)]" : "shadow-[inset_0_2px_0_var(--brand)]"),
              )}
            >
              <GripVertical aria-hidden className="text-muted-foreground size-4 shrink-0 cursor-grab" />
              <span className="text-muted-foreground w-7 shrink-0 text-right tabular-nums">{index + 1}</span>
              <Cover type="album" id={track.albumId} size={64} className="size-8" />
              <div className="min-w-0 flex-1">
                <p className="truncate">{track.title}</p>
                <p className="text-muted-foreground truncate text-xs">{track.artistName}</p>
              </div>
              <span className="text-muted-foreground tabular-nums max-sm:hidden">{formatDuration(track.duration)}</span>
              <Button variant="ghost" size="icon-sm" aria-label={`Move ${track.title} up`} disabled={index === 0} onClick={() => move(index, index - 1)}>
                <ArrowUp />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Move ${track.title} down`} disabled={index === order.length - 1} onClick={() => move(index, index + 1)}>
                <ArrowDown />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Remove ${track.title}`} className="text-muted-foreground" onClick={() => apply(order.filter((_, i) => i !== index))}>
                <X />
              </Button>
            </li>
          ))}
        </ol>
      ) : null}
    </FormSection>
  );
}
