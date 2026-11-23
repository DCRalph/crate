"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ListMusic } from "lucide-react";

import { Cover } from "~/components/library/cover";
import { LikeButton } from "~/components/library/like-button";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { usePlayerEngine } from "./engine";
import { useDeckKeys } from "./keys";
import { NowPlaying } from "./now-playing";
import { Scrubber } from "./scrubber";
import { useSelection } from "./selection";
import { ShortcutsDialog } from "./shortcuts";
import { StreamControl } from "./stream-control";
import { Transport } from "./transport";
import { Volume } from "./volume";

/**
 * The console across the bottom of the cabinet: the selection window, what
 * is playing, the transport's chrome keys, the track as a waveform lit in its
 * own window of glass to seek on, and the way into the queue and the
 * playback settings. The sound itself is `usePlayerEngine`, whose two audio
 * elements are rendered here; the keys are `useDeckKeys`.
 *
 * Phones get a slimmer bar (title, play, next); tapping it opens the Now
 * playing sheet, which has the scrubber, the full transport and the queue.
 */
export function PlayerBar() {
  const { deck, track, playing, time, duration, loading, seek, seekBy, back } = usePlayerEngine();
  const [sheetOpen, setSheetOpen] = useState(false);
  const queueButton = useRef<HTMLButtonElement>(null);
  useDeckKeys({ seekBy, back, toggleQueue: () => setSheetOpen((open) => !open) });
  const transport = { playing, disabled: !track, onPrevious: back };

  return (
    // Always the night cabinet, so the lamps read the same at any hour.
    <footer id="player-bar" className="night console relative z-50 flex [view-transition-name:console] h-(--player-height) shrink-0 items-center gap-2.5 px-3 sm:gap-3.5 md:col-span-2">
      <audio {...deck(0)} />
      <audio {...deck(1)} />

      {/* Phones: a hairline of progress along the top instead of the scrubber. */}
      <div
        className="bg-lamp absolute top-0 left-0 h-0.5 w-full origin-left md:hidden"
        style={{ transform: `scaleX(${duration ? Math.min(time / duration, 1) : 0})` }}
      />

      <TypedSelection />
      <SelectWindow />

      <div className="flex min-w-0 flex-1 items-center gap-3 md:w-52 md:flex-none lg:w-68 xl:w-80">
        {track ? (
          // Keyed by track, so each new one rises into place. It sits back a little until the sound starts.
          <div key={track.id} aria-busy={loading} className={cn("animate-rise flex min-w-0 flex-1 items-center gap-2.5 transition-opacity", loading && "opacity-55")}>
            <Cover type="album" id={track.albumId} size={112} glow className="size-12 max-sm:hidden" />
            {/* The track as a title strip: name on ivory, artist on the band. */}
            <div className="print min-w-0 flex-1 overflow-hidden rounded-[3px] max-md:hidden">
              <Link href={`/albums/${track.albumId}`} className="t-label block truncate px-2 text-[12.5px] leading-[26px] hover:underline">
                {track.title}
              </Link>
              <Link href={`/artists/${track.artistId}`} className="bg-brand block truncate px-2 text-xs leading-[22px] font-medium hover:underline">
                {track.artistName}
              </Link>
            </div>
            {/* Phones: the whole strip opens Now playing. */}
            <button
              type="button"
              aria-label={`Now playing: ${track.title}, ${track.artistName}`}
              className="print focus-visible:ring-ring/60 min-w-0 flex-1 overflow-hidden rounded-[3px] text-left outline-none focus-visible:ring-[3px] md:hidden"
              onClick={() => setSheetOpen(true)}
            >
              <span className="t-label block truncate px-2 text-[12.5px] leading-6">{track.title}</span>
              <span className="bg-brand block truncate px-2 text-xs leading-5 font-medium">{track.artistName}</span>
            </button>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Nothing on the deck</p>
        )}
        {/* Keyed by track, so a like still in flight stays with the track it was made on. */}
        {track ? <LikeButton key={`like-${track.id}`} track={track} className="max-md:hidden" /> : null}
      </div>

      <Transport {...transport} className="max-md:[&>[data-wide]]:hidden" />
      {/* The waveform, lit amber in a window of glass set into the console. */}
      <div className="glass-inset flex h-12 min-w-0 flex-1 items-center rounded-md px-2.5 max-md:hidden">
        <Scrubber trackId={track?.id} time={time} duration={duration} onSeek={seek} tone="lamp" />
      </div>

      <div className="flex items-center justify-end gap-1">
        <StreamControl indicator className="max-md:hidden" />
        <Button
          ref={queueButton}
          variant="ghost"
          size="icon-sm"
          aria-label="Queue"
          aria-keyshortcuts="Q"
          aria-expanded={sheetOpen}
          className={cn("text-muted-foreground", sheetOpen && "bg-accent text-foreground")}
          onClick={() => setSheetOpen(!sheetOpen)}
        >
          <ListMusic />
        </Button>
        {/* Narrower screens find the volume in the playback settings. */}
        <Volume className="max-lg:hidden" />
      </div>

      {/* What a screen reader hears when the track changes. */}
      <p className="sr-only" aria-live="polite">
        {track ? `${track.title}, ${track.artistName}` : ""}
      </p>

      <NowPlaying
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        track={track}
        returnFocusTo={queueButton}
        controls={
          <>
            <Scrubber trackId={track?.id} time={time} duration={duration} onSeek={seek} />
            <Transport {...transport} large />
          </>
        }
        // The settings page would open behind the sheet, so following the link to it closes the sheet.
        settings={<StreamControl onNavigate={() => setSheetOpen(false)} />}
      />
      <ShortcutsDialog />
    </footer>
  );
}

/**
 * The selection window at the head of the console: what is being typed to
 * pick a row or a tile ("B 3"), in amber on dark glass, rolling once for each
 * key. Unlit dashes while nothing is.
 */
function SelectWindow() {
  const typed = useSelection((state) => state.typed);
  return (
    <div role="status" className="glass-inset flex h-12 w-[4.25rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-md max-lg:hidden">
      <span className="t-label text-muted-foreground text-[9px] tracking-[0.14em]">Select</span>
      {typed ? (
        <span key={typed} className="t-num animate-roll text-lamp text-[22px] tracking-[0.06em] [text-shadow:0_0_10px_rgb(255_196_77/0.55)]">
          {/* A long run of digits shows its end, which is what was typed last. */}
          {typed.length > 6 ? `…${typed.slice(-5)}` : typed.replace(/^([A-Z])/, "$1 ")}
        </span>
      ) : (
        <span className="t-num text-[22px] tracking-[0.06em] text-[#2b565b]" aria-label="Nothing selected">
          – –
        </span>
      )}
    </div>
  );
}

/**
 * The same on a phone or a tablet, where the console has no room for the
 * window: it floats just above, and only while something is being typed.
 */
function TypedSelection() {
  const typed = useSelection((state) => state.typed);
  if (!typed) return null;
  return (
    <div role="status" className="bg-glass animate-rise absolute bottom-full left-3 mb-2 rounded-[5px] px-2.5 pt-1 pb-0.5 text-center shadow-[inset_0_0_0_1px_var(--cab-line)] lg:hidden">
      <span className="t-label text-muted-foreground block text-[9.5px] tracking-[0.1em]">Select</span>
      <span key={typed} className="t-num animate-roll text-lamp block text-[26px] tracking-[0.06em]">
        {typed}
      </span>
    </div>
  );
}
