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

/** How far an arrow key moves through a track, as a share of it. */
const keyStep = 0.1;

/**
 * A track's small waveform on its row, and a way to jump into it: a click or
 * tap at a point plays the track from there, or moves it there when it is the
 * one playing. It is a slider too: the arrow keys move a tenth of the track
 * at a time (starting it, when it isn't playing), Home goes to its start, and
 * a screen reader hears where it is. On the playing row the part already
 * played is drawn solid. `onPlayFrom` starts the track from a point when it
 * isn't on.
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

  /** Plays from `seconds` in: moves the track when it is the one playing, otherwise starts it there. */
  const goTo = (seconds: number) => {
    const to = Math.min(Math.max(seconds, 0), Math.max(duration - 1, 0));
    if (time === null) return onPlayFrom(to);
    usePlayhead.getState().seek?.(to);
    usePlayer.getState().setPlaying(true);
  };

  const svg = (
    <svg viewBox={`0 0 ${peaks.length * 2} 100`} preserveAspectRatio="none" className="block h-3.5 w-28" aria-hidden>
      <path d={path} fill="currentColor" />
    </svg>
  );

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={`Play ${title} from a point`}
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={Math.round(time ?? 0)}
      aria-valuetext={time === null ? `Not playing, ${formatDuration(duration)} long` : `${formatDuration(time)} of ${formatDuration(duration)}`}
      title={duration ? `Jump into ${title} (${formatDuration(duration)})` : undefined}
      onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        goTo(box.width ? ((event.clientX - box.left) / box.width) * duration : 0);
      }}
      onKeyDown={(event) => {
        const now = time ?? 0;
        const step = duration * keyStep;
        const to =
          event.key === "ArrowRight" || event.key === "ArrowUp"
            ? now + step
            : event.key === "ArrowLeft" || event.key === "ArrowDown"
              ? now - step
              : event.key === "Home"
                ? 0
                : null;
        if (to === null) return;
        event.preventDefault();
        goTo(to);
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
    </div>
  );
});
