"use client";

import { Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from "lucide-react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { useCanSkip, usePlayer } from "./store";

/** A key that switches a way of playing on and off. Its lamp is lit while it is on. */
function ModeKey({ label, lit, large, onClick, children }: { label: string; lit: boolean; large: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      data-wide
      variant="ghost"
      size={large ? "icon-lg" : "icon-sm"}
      aria-label={label}
      title={label}
      aria-pressed={lit}
      className={cn("relative", lit ? "text-foreground" : "text-muted-foreground")}
      onClick={onClick}
    >
      {children}
      {lit ? <span className="lamp animate-pop absolute bottom-px left-1/2 size-1.5 -translate-x-1/2" data-lit /> : null}
    </Button>
  );
}

/** Shuffle, previous, play or pause, next, repeat. The slim bar on a phone keeps only play and next. */
export function Transport({
  playing,
  disabled,
  large = false,
  onPrevious,
  className,
}: {
  playing: boolean;
  disabled: boolean;
  large?: boolean;
  onPrevious: () => void;
  className?: string;
}) {
  const canSkip = useCanSkip();
  const shuffle = usePlayer((state) => state.lineup !== null);
  const repeat = usePlayer((state) => state.repeat);
  const { toggleShuffle, cycleRepeat, next, setPlaying } = usePlayer.getState();
  return (
    <div className={cn("flex shrink-0 items-center justify-center", large ? "gap-3" : "gap-1.5", className)}>
      <ModeKey label={shuffle ? "Shuffle is on" : "Shuffle"} lit={shuffle} large={large} onClick={toggleShuffle}>
        <Shuffle />
      </ModeKey>
      <Button data-wide size={large ? "icon-lg" : "icon-sm"} aria-label="Previous" disabled={disabled} onClick={onPrevious}>
        <SkipBack className="fill-current" />
      </Button>
      {/* The one coral key on the deck. */}
      <Button variant="brand" aria-label={playing ? "Pause" : "Play"} disabled={disabled} onClick={() => setPlaying(!playing)} className={large ? "h-12 w-16" : "h-9 w-11"}>
        {playing ? <Pause className={cn("fill-current", large && "size-5")} /> : <Play className={cn("fill-current", large && "size-5")} />}
      </Button>
      {/* Off on the last track unless repeating: there is nowhere to go, and it shouldn't stop the music. */}
      <Button size={large ? "icon-lg" : "icon-sm"} aria-label="Next" disabled={disabled || !canSkip} onClick={next}>
        <SkipForward className="fill-current" />
      </Button>
      <ModeKey label={repeat === "one" ? "Repeating this track" : repeat === "all" ? "Repeating the queue" : "Repeat"} lit={repeat !== "off"} large={large} onClick={cycleRepeat}>
        {repeat === "one" ? <Repeat1 /> : <Repeat />}
      </ModeKey>
    </div>
  );
}
