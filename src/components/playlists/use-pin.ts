"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useTRPC } from "~/trpc/react";

/** Pins a playlist to the top of your own Playlists page, or takes it down. */
export function usePin() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const pin = useMutation(
    trpc.playlists.pin.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.playlists.pathFilter()),
      onError: (error) => toast.error(error.message),
    }),
  );
  return (playlist: { id: number; name: string; pinnedAt: Date | null }) =>
    pin.mutate(
      { id: playlist.id, pinned: !playlist.pinnedAt },
      { onSuccess: () => toast(playlist.pinnedAt ? `Unpinned ${playlist.name}` : `Pinned ${playlist.name} to the top`) },
    );
}
