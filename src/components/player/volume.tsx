"use client";

import { Volume1, Volume2, VolumeX } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Slider } from "~/components/ui/slider";
import { cn } from "~/lib/utils";
import { usePlayer } from "./store";

/**
 * Mute and the volume slider. The deck shows them on a wide screen; narrower
 * ones find them in the playback settings.
 */
export function Volume({ className }: { className?: string }) {
  const volume = usePlayer((state) => state.volume);
  const { setVolume, toggleMute } = usePlayer.getState();
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button variant="ghost" size="icon-sm" aria-label={volume ? "Mute" : "Unmute"} className="text-muted-foreground" onClick={toggleMute}>
        {volume === 0 ? <VolumeX /> : volume < 0.5 ? <Volume1 /> : <Volume2 />}
      </Button>
      <Slider
        aria-label="Volume"
        aria-valuetext={`${Math.round(volume * 100)}%`}
        className="w-24 flex-1"
        min={0}
        max={1}
        step={0.02}
        value={[volume]}
        onValueChange={([value]) => setVolume(value ?? 0)}
      />
    </div>
  );
}
