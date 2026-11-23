"use client";

import { Pause, Play } from "lucide-react";

import { usePlayer, usePlayingFrom } from "~/components/player/store";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import type { WebTrack } from "~/server/api/routers/library";

/**
 * The Play key for a whole list: an album, a playlist, an artist, Liked.
 * `from` names the list ("album:12"). While that is what the queue was played
 * from, the key pauses and resumes it, and reads Pause while it sounds.
 */
export function PlayKey({ from, tracks, size }: { from: string; tracks: WebTrack[]; size?: "sm" }) {
  const { mine, sounding, toggle } = usePlayingFrom(from);
  return (
    <Button variant="brand" size={size} disabled={!tracks.length} onClick={() => (mine ? toggle() : usePlayer.getState().play(tracks, undefined, from))}>
      {sounding ? <Pause className="fill-current" /> : <Play className="fill-current" />}
      {sounding ? "Pause" : "Play"}
    </Button>
  );
}

/**
 * The same key on a cover tile, where the tracks have to be fetched first
 * (`onPlay`). It comes up when the tile is hovered or focused, and stays up
 * on the tile that is playing. Sits in the corner of a box sized to the cover.
 */
export function TilePlayKey({ from, name, onPlay }: { from: string; name: string; onPlay: () => void }) {
  const { mine, sounding, toggle } = usePlayingFrom(from);
  return (
    <button
      type="button"
      aria-label={sounding ? `Pause ${name}` : `Play ${name}`}
      onClick={() => (mine ? toggle() : onPlay())}
      className={cn(
        "key bg-brand text-ink focus-visible:ring-ring/60 pointer-events-auto absolute right-2 bottom-2 grid h-9 w-11 place-items-center rounded-md outline-none transition-[opacity,translate] duration-200 ease-(--ease-out-expo) focus-visible:translate-y-0 focus-visible:opacity-100 focus-visible:ring-[3px]",
        // A phone has no hover, so only the tile that is playing shows its key there.
        sounding ? "opacity-100" : "translate-y-1.5 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 pointer-coarse:hidden",
      )}
    >
      {sounding ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
    </button>
  );
}
