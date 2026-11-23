"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Check, SlidersHorizontal } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { cn } from "~/lib/utils";
import { capNote, normaliseOptions, qualityOptions, sentLabel, sentSummary, usePlayback } from "./playback";
import { sleepChoices, usePlayer, type SleepChoice } from "./store";
import { Volume } from "./volume";

const sleepLabels: Record<SleepChoice, string> = { 15: "15 minutes", 30: "30 minutes", 60: "1 hour", track: "End of track" };

/**
 * The player's audio settings behind one button, which reads as what is being
 * sent ("FLAC", "MP3 192"). Quality and volume levelling are changed here and
 * apply straight away, and so does the sleep timer; the rest is on the
 * Playback page. Below the width where the deck has room for it, the volume
 * is here too. `onNavigate` runs when the link to that page is followed, for
 * a caller that has to get out of the way. On the console (`indicator`) the
 * button is a lit indicator in a little window of glass while a track is on.
 */
export function StreamControl({ onNavigate, indicator = false, className }: { onNavigate?: () => void; indicator?: boolean; className?: string }) {
  const { cap, quality, track, sent } = usePlayback();
  const normalise = usePlayer((state) => state.normalise);
  const sleep = usePlayer((state) => state.sleep?.choice ?? null);
  const { setQuality, setNormalise, setSleep } = usePlayer.getState();
  const [open, setOpen] = useState(false);
  const label = track && sent ? sentLabel(track, sent) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={label ? `Playback settings, sending ${label}` : "Playback settings"}
          // A width of its own, so a change from FLAC to OPUS 256 doesn't shift the scrubber.
          className={cn(
            "text-muted-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground min-w-[4.25rem] px-2 text-[11px] tabular-nums",
            indicator && label && "glass-inset text-lamp hover:text-lamp data-[state=open]:text-lamp [text-shadow:0_0_8px_rgb(255_196_77/0.55)] hover:bg-transparent data-[state=open]:bg-transparent",
            className,
          )}
        >
          {label ?? <SlidersHorizontal />}
        </Button>
      </PopoverTrigger>
      {/* Marked so the queue sheet knows a click in here isn't a click away from it. */}
      <PopoverContent data-player-settings side="top" align="end" className="flex w-64 flex-col gap-4">
        <Volume className="lg:hidden" />
        <div className="flex flex-col gap-2">
          <RadioList legend="Quality" options={qualityOptions(cap)} value={quality} onChange={setQuality} />
          {cap !== null ? <p className="text-muted-foreground px-2 text-xs">{capNote(cap)}</p> : null}
        </div>
        <RadioList legend="Even out volume" options={normaliseOptions} value={normalise} onChange={setNormalise} />
        <label className="flex items-center justify-between gap-3 px-2 text-sm whitespace-nowrap">
          Sleep timer
          <Select value={String(sleep ?? "off")} onValueChange={(value) => setSleep(sleepChoices.find((choice) => String(choice) === value) ?? null)}>
            <SelectTrigger size="sm" aria-label="Sleep timer" className="w-[7.5rem]">
              <SelectValue />
            </SelectTrigger>
            {/* Marked like the popover it opens from, so choosing here isn't a click away from the queue either. */}
            <SelectContent data-player-settings align="end">
              <SelectItem value="off">Off</SelectItem>
              {sleepChoices.map((choice) => (
                <SelectItem key={choice} value={String(choice)}>
                  {sleepLabels[choice]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <div className="flex flex-col gap-2 border-t px-2 pt-3 text-xs">
          {track && sent ? <p className="text-muted-foreground">{sentSummary(track, sent)}</p> : null}
          <Link
            href="/account/playback"
            className="w-fit underline-offset-4 hover:underline"
            onClick={() => {
              setOpen(false);
              onNavigate?.();
            }}
          >
            All playback settings
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * One choice out of a few, as a list with a tick on the chosen one. They are
 * real radio buttons, so arrow keys move between them; only the look is drawn here.
 */
function RadioList<T>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="flex flex-col">
      <legend className="t-label text-muted-foreground mb-1.5 px-2 text-[10px]">{legend}</legend>
      {options.map((option) => (
        <label
          key={option.label}
          className="has-focus-visible:bg-accent hover:bg-accent/50 relative flex cursor-default items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm has-disabled:pointer-events-none has-disabled:opacity-50"
        >
          <input
            type="radio"
            name={name}
            className="peer sr-only"
            checked={option.value === value}
            disabled={option.disabled}
            onChange={() => onChange(option.value)}
          />
          {option.label}
          <Check aria-hidden className="text-muted-foreground size-4 opacity-0 peer-checked:opacity-100" />
        </label>
      ))}
    </fieldset>
  );
}
