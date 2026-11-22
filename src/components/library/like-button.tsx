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
 * back if the server says no. Liked tracks live on the Liked page.
 */
export function LikeButton({ track, className }: { track: { id: number; title: string; starred: boolean }; className?: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // What was just clicked, shown until the lists that feed `track.starred` have caught up.
  const [pending, setPending] = useState<boolean | null>(null);
  const liked = pending ?? track.starred;
  // The pop is for a like the listener just made, not for hearts that arrive already filled.
  const [justLiked, setJustLiked] = useState(false);
  const star = useMutation(
    trpc.library.star.mutationOptions({
      onSuccess: async (_, input) => {
        usePlayer.getState().setStarred(track.id, input.starred);
        await Promise.all([queryClient.invalidateQueries(trpc.library.pathFilter()), queryClient.invalidateQueries(trpc.playlists.pathFilter())]);
      },
      onError: (error) => toast.error(error.message),
      onSettled: () => setPending(null),
    }),
  );

  return (
    <button
      type="button"
      aria-label={liked ? `Unlike ${track.title}` : `Like ${track.title}`}
      aria-pressed={liked}
      onClick={() => {
        setPending(!liked);
        setJustLiked(!liked);
        star.mutate({ type: "track", id: track.id, starred: !liked });
      }}
      className={cn(
        "focus-visible:ring-ring/50 grid size-8 place-items-center rounded-md outline-none transition-colors focus-visible:ring-[3px]",
        liked ? "text-brand-text" : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <Heart className={cn("size-4", liked && "fill-current", liked && justLiked && "animate-pop")} />
    </button>
  );
}
