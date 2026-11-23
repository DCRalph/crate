"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Slider } from "~/components/ui/slider";
import { formatDuration } from "~/lib/format";
import { cn } from "~/lib/utils";
import { isFinal } from "~/trpc/failure";
import { useTRPC } from "~/trpc/react";

/** A bar and the gap after it, in pixels: a bar one pixel wide, then half a pixel of gap. */
const pitch = 1.5;

/** The track's loudness as bars about a centre line, in whatever the text colour is. */
const Bars = memo(function Bars({ peaks, count }: { peaks: number[]; count: number }) {
  const path = useMemo(() => {
    let d = "";
    for (let bar = 0; bar < count; bar++) {
      const from = Math.floor((bar * peaks.length) / count);
      const to = Math.max(from + 1, Math.floor(((bar + 1) * peaks.length) / count));
      let peak = 0;
      for (let i = from; i < to; i++) peak = Math.max(peak, peaks[i] ?? 0);
      // Never nothing: silence is still a thin line, so the track's whole length can be seen and clicked.
      const height = Math.max(4, (peak / 255) * 100);
      d += `M${bar * pitch} ${(100 - height) / 2}h1v${height}h-1z`;
    }
    return d;
  }, [peaks, count]);
  return (
    <svg viewBox={`0 0 ${count * pitch} 100`} preserveAspectRatio="none" className="block size-full" aria-hidden>
      <path d={path} fill="currentColor" />
    </svg>
  );
});

/**
 * A waveform filling its parent: every bar faint, and the part already played
 * solid on top. As many bars as fit the width. One colour throughout, or on
 * the console (`lit`) the played part lit amber, glowing.
 */
function Waveform({ peaks, played, lit }: { peaks: number[]; played: number; lit: boolean }) {
  const [width, setWidth] = useState(0);
  const measure = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => entry && setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const count = Math.max(1, Math.floor(width / pitch));

  return (
    <div ref={measure} className="animate-arrive absolute inset-0">
      {width ? (
        <>
          <div className="absolute inset-0 opacity-40">
            <Bars peaks={peaks} count={count} />
          </div>
          <div
            className={cn("absolute inset-y-0 left-0 overflow-hidden", lit && "text-lamp drop-shadow-[0_0_3px_rgb(255_196_77/0.55)]")}
            style={{ width: `${played * 100}%` }}
          >
            <div className="h-full" style={{ width }}>
              <Bars peaks={peaks} count={count} />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * Elapsed time, the track drawn as its waveform, and its length. The waveform
 * is the seek control: a slider lies over it unseen, so it drags, takes the
 * arrow keys and reads to a screen reader as one. A track with no waveform
 * (its file couldn't be read) gets the plain slider.
 *
 * Moving the thumb shows where it will land; the seek itself waits for the
 * drag to be let go, or for the arrow keys to be still for a moment, so
 * holding one down is one seek and not one for every repeat.
 */
export function Scrubber({
  trackId,
  time,
  duration,
  onSeek,
  tone,
  size = "md",
  className,
}: {
  /** The track being played, or undefined with nothing on the deck. */
  trackId: number | undefined;
  time: number;
  duration: number;
  onSeek: (seconds: number) => void;
  /** Amber for the console: the played part of the waveform is lit, and so is the plain slider. Left out on print, where ink reads better. */
  tone?: "lamp";
  /** "lg" is the tall waveform of Now playing, with the times under it. */
  size?: "md" | "lg";
  className?: string;
}) {
  const trpc = useTRPC();
  // A waveform never changes while its file doesn't, so once drawn it is kept. Until then (a scan hasn't drawn
  // it, or its file couldn't be read this time) it is asked for again every half minute.
  const waveform = useQuery(
    trpc.library.waveform.queryOptions(
      { trackId: trackId ?? 0 },
      {
        enabled: trackId !== undefined,
        staleTime: Infinity,
        // A track that is gone or out of reach won't come back by asking again.
        retry: (count, error) => count < 2 && !isFinal(error),
        refetchInterval: (query) => (query.state.data || (query.state.error && isFinal(query.state.error)) ? false : 30_000),
      },
    ),
  );
  const peaks = trackId === undefined ? null : waveform.data;

  /** Where the thumb has been moved to and the track hasn't yet. */
  const [moved, setMoved] = useState<number | null>(null);
  const movedTo = useRef<number | null>(null);
  const pointerDown = useRef(false);
  const still = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(still.current), []);

  const commit = () => {
    clearTimeout(still.current);
    pointerDown.current = false;
    if (movedTo.current !== null) onSeek(movedTo.current);
    movedTo.current = null;
    setMoved(null);
  };
  const shown = moved ?? time;

  return (
    <div
      className={cn(
        "text-muted-foreground flex w-full items-center gap-2 text-[11px] tabular-nums",
        size === "lg" && "grid grid-cols-2 gap-x-2 gap-y-1.5 text-[12px] [&>span]:w-auto [&>span:first-child]:order-2 [&>span:first-child]:text-left [&>span:last-child]:order-3 [&>span:last-child]:text-right",
        className,
      )}
    >
      <span className="w-9 text-right">{formatDuration(shown)}</span>
      <div
        className={cn(
          "has-focus-visible:ring-ring/50 text-foreground relative flex min-w-0 flex-1 items-center rounded-sm has-focus-visible:ring-[3px]",
          size === "lg" ? "order-1 col-span-2 h-20" : "h-9",
        )}
      >
        {peaks ? <Waveform key={trackId} peaks={peaks} played={duration ? Math.min(shown / duration, 1) : 0} lit={tone === "lamp"} /> : null}
        <Slider
          tone={tone}
          aria-label="Seek"
          aria-valuetext={`${formatDuration(shown)} of ${formatDuration(duration)}`}
          disabled={trackId === undefined}
          min={0}
          max={Math.max(duration, 1)}
          step={1}
          value={[Math.min(shown, duration)]}
          // Over a waveform the slider is only there to be used, not seen.
          className={cn(peaks && "absolute inset-0 h-full cursor-pointer opacity-0")}
          onPointerDown={() => {
            pointerDown.current = true;
          }}
          onValueChange={([value = 0]) => {
            movedTo.current = value;
            setMoved(value);
            if (pointerDown.current) return;
            clearTimeout(still.current);
            still.current = setTimeout(commit, 250);
          }}
          // The drag being let go, wherever the pointer ended up. The slider's own commit is skipped when the thumb
          // comes back to where it started, which would leave the clock stuck on the drag.
          onLostPointerCapture={() => {
            if (pointerDown.current) commit();
          }}
        />
      </div>
      <span className="w-9">{formatDuration(duration)}</span>
    </div>
  );
}
