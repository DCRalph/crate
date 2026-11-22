"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useTRPC } from "~/trpc/react";

/** Names a new playlist, optionally starting it with `trackIds`. */
export function NewPlaylistDialog({
  open,
  onOpenChange,
  trackIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trackIds?: number[];
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const create = useMutation(
    trpc.playlists.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.playlists.pathFilter());
        toast(`Created ${name.trim()}`);
        setName("");
        onOpenChange(false);
      },
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate({ name, trackIds });
          }}
        >
          <DialogHeader>
            <DialogTitle>New playlist</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="playlist-name">Name</Label>
            <Input id="playlist-name" value={name} onChange={(event) => setName(event.target.value)} autoFocus maxLength={120} />
            {create.error ? <p className="text-destructive text-xs">{create.error.message}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
