"use client";

import { memo, useMemo } from "react";

import { usePlayhead } from "~/components/player/playhead";
import { usePlayer } from "~/components/player/store";
import { formatDuration } from "~/lib/format";
import { cn } from "~/lib/utils";

/** The bars of a small waveform as one path: one bar for each of its numbers, about a centre line. */
function barsOf(peaks: number[]) {
  return peaks
    .map((peak, i) => {
      const height = Math.max(6, (peak / 255) * 100);
      return `M${i * 2} ${(100 - height) / 2}h1.25v${height}h-1.25z`;
    })
    .join("");
}

/**
 * A track's small waveform on its row, and a way to jump into it: a click or
 * tap at a point plays the track from there, or moves it there when it is the
 * one playing. On the playing row the part already played is drawn solid.
 * Quiet passages still show as a hairline, so the whole track reads at a
 * glance. `onPlayFrom` starts the track from a point when it isn't on.
 */
export const RowWave = memo(function RowWave({
  peaks,
  trackId,
  duration,
  title,
  onPlayFrom,
}: {
  peaks: number[];
  trackId: number;
  duration: number;
  title: string;
  onPlayFrom: (seconds: number) => void;
}) {
  const path = useMemo(() => barsOf(peaks), [peaks]);
  // Only the playing row follows the clock.
  const time = usePlayhead((state) => (state.trackId === trackId ? state.time : null));
  const played = time !== null && duration > 0 ? Math.min(time / duration, 1) : null;
  const svg = (
    <svg viewBox={`0 0 ${peaks.length * 2} 100`} preserveAspectRatio="none" className="block h-3.5 w-28" aria-hidden>
      <path d={path} fill="currentColor" />
    </svg>
  );

  return (
    <button
      type="button"
      aria-label={`Play ${title} from a point`}
      title={duration ? `Jump into ${title} (${formatDuration(duration)})` : undefined}
      onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        // A key press clicks at no point at all, which is the start.
        const fraction = box.width && event.clientX ? Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1) : 0;
        const seconds = fraction * duration;
        if (time === null) return onPlayFrom(seconds);
        usePlayhead.getState().seek?.(seconds);
        usePlayer.getState().setPlaying(true);
      }}
      className={cn(
        "focus-visible:ring-ring/60 relative block cursor-pointer rounded-sm py-2.5 outline-none transition-colors focus-visible:ring-[3px]",
        played === null ? "text-muted-foreground/70 hover:text-muted-foreground" : "text-foreground",
      )}
    >
      <span className={cn("block", played !== null && "opacity-35")}>{svg}</span>
      {played !== null ? (
        <span className="absolute inset-y-2.5 left-0 overflow-hidden" style={{ width: `${played * 100}%` }}>
          {svg}
        </span>
      ) : null}
    </button>
  );
});
