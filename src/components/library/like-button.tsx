"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { toast } from "sonner";

import { usePlayer } from "~/components/player/store";
import { cn } from "~/lib/utils";
import { useTRPC } from "~/trpc/react";

/**
 * The heart on a track. Fills at once, pops when liking, and puts itself
 * back if the server says no. Liked tracks live on the Liked page. It is
 * `aria-pressed` from the moment it is clicked, which is also what a row uses
 * to keep a new like in view.
 */
export function LikeButton({ track, className }: { track: { id: number; title: string; starred: boolean }; className?: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // What was just clicked, shown until the lists that feed `track.starred` have caught up.
  const [pending, setPending] = useState<boolean | null>(null);
  if (pending !== null && pending === track.starred) setPending(null);
  const liked = pending ?? track.starred;
  // The pop is for a like the listener just made, not for hearts that arrive already filled.
  const [justLiked, setJustLiked] = useState(false);
  const star = useMutation(
    trpc.library.star.mutationOptions({
      // The lists are refreshed without being waited for, so the heart can be clicked again straight away.
      onSuccess: (_, input) => {
        // `input.id`, not `track.id`: by now this button may be showing a different track.
        usePlayer.getState().setStarred(input.id, input.starred);
        for (const filter of [trpc.library.pathFilter(), trpc.playlists.pathFilter(), trpc.info.pathFilter()]) void queryClient.invalidateQueries(filter);
      },
      onError: (error) => {
        toast.error(error.message);
        setPending(null);
      },
    }),
  );

  return (
    <button
      type="button"
      aria-label={liked ? `Unlike ${track.title}` : `Like ${track.title}`}
      aria-pressed={liked}
      // How the deck's L key finds its heart.
      data-like
      onClick={() => {
        // One write at a time, so a quick double click can't land out of order.
        if (star.isPending) return;
        setPending(!liked);
        setJustLiked(!liked);
        star.mutate({ type: "track", id: track.id, starred: !liked });
      }}
      className={cn(
        "focus-visible:ring-ring/50 grid size-8 place-items-center rounded-md outline-none transition-colors focus-visible:ring-[3px]",
        // Coral, like the band: a like is the other mark a person leaves on a track.
        liked ? "text-brand" : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <Heart className={cn("size-4", liked && "fill-current", liked && justLiked && "animate-pop")} />
    </button>
  );
}
