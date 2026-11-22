"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListEnd, Pencil, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "~/components/confirm-provider";
import { Cover } from "~/components/library/cover";
import { TrackTable, TrackTableSkeleton } from "~/components/library/track-table";
import { usePlayer } from "~/components/player/store";
import { PageCrumb } from "~/components/shell/crumb";
import { Page } from "~/components/shell/page";
import { Empty, LoadError } from "~/components/shell/states";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import { count, formatLength } from "~/lib/format";
import { useTRPC } from "~/trpc/react";

/** One playlist. Its owner can rename it, share it, take tracks out and delete it; folder playlists are read-only. */
export function PlaylistView({ id }: { id: number }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const playlist = useQuery(trpc.playlists.byId.queryOptions({ id }));
  const { play, enqueue } = usePlayer.getState();
  const [renaming, setRenaming] = useState(false);

  const refresh = () => queryClient.invalidateQueries(trpc.playlists.pathFilter());
  const onError = (error: { message: string }) => toast.error(error.message);
  const update = useMutation(trpc.playlists.update.mutationOptions({ onSuccess: refresh, onError }));
  const removeTrack = useMutation(trpc.playlists.removeTrack.mutationOptions({ onSuccess: refresh, onError }));
  const remove = useMutation(
    trpc.playlists.delete.mutationOptions({
      onSuccess: async () => {
        await refresh();
        router.push("/playlists");
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
              data.readOnly ? "From a folder" : `By ${data.ownerName}`,
              count(data.tracks.length, "track"),
              formatLength(data.duration),
            ].join(" · ")}
          </p>
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
              <>
                <Button variant="ghost" size="icon" aria-label="Rename" onClick={() => setRenaming(true)}>
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete playlist"
                  onClick={async () => {
                    const ok = await confirm({
                      title: `Delete ${data.name}?`,
                      description: "The playlist goes. The tracks stay in the library.",
                      confirmLabel: "Delete",
                      variant: "destructive",
                    });
                    if (ok) remove.mutate({ id });
                  }}
                >
                  <Trash2 />
                </Button>
                <label className="ml-2 flex items-center gap-2 text-sm">
                  <Switch
                    checked={data.isPublic}
                    onCheckedChange={(isPublic) =>
                      update.mutate({ id, isPublic }, { onSuccess: () => toast(isPublic ? "Everyone can see this playlist" : "Only you can see this playlist") })
                    }
                  />
                  Public
                </label>
              </>
            ) : null}
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

      {/* Mounted only while open, so the field starts from the current name each time. */}
      {renaming ? (
        <RenameDialog
          name={data.name}
          pending={update.isPending}
          onClose={() => setRenaming(false)}
          onSave={(name) => update.mutate({ id, name }, { onSuccess: () => setRenaming(false) })}
        />
      ) : null}
    </Page>
  );
}

function RenameDialog({
  name: current,
  pending,
  onClose,
  onSave,
}: {
  name: string;
  pending: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(current);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(name);
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename playlist</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="rename-playlist">Name</Label>
            <Input id="rename-playlist" value={name} onChange={(event) => setName(event.target.value)} autoFocus maxLength={120} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || pending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
