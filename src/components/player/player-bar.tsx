"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ListMusic, Pause, Play, SkipBack, SkipForward, Volume1, Volume2, VolumeX, X } from "lucide-react";
import { toast } from "sonner";

import { Cover } from "~/components/library/cover";
import { LikeButton } from "~/components/library/like-button";
import { Button } from "~/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "~/components/ui/sheet";
import { Slider } from "~/components/ui/slider";
import { count, formatDuration } from "~/lib/format";
import { cn } from "~/lib/utils";
import type { WebTrack } from "~/server/api/routers/library";
import { useTRPC } from "~/trpc/react";
import { useCurrentTrack, usePlayer } from "./store";

/** A play counts once the listener is this far in: half the track, or four minutes. */
const playedAfter = (duration: number) => Math.min(duration / 2, 240);

/**
 * The bar across the bottom of the app, and the only audio element. It
 * follows the player store: a new current track loads, `playing` plays or
 * pauses. Media keys and lock-screen controls work through the Media Session API.
 *
 * Phones get a slimmer bar (title, play, next); tapping it opens the Now
 * playing sheet, which has the scrubber, the full transport and the queue.
 */
export function PlayerBar() {
  const trpc = useTRPC();
  const audioRef = useRef<HTMLAudioElement>(null);
  const track = useCurrentTrack();
  const playing = usePlayer((state) => state.playing);
  const volume = usePlayer((state) => state.volume);
  const { next, previous, setPlaying, setVolume, toggleMute } = usePlayer.getState();
  const [time, setTime] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  /** Counts loads, so each play of a track is recorded once even if it repeats. */
  const loads = useRef(0);
  const recordedLoad = useRef(0);
  const recordPlay = useMutation(trpc.library.recordPlay.mutationOptions());

  // The saved queue is read after mount so the first render matches the server's.
  useEffect(() => void usePlayer.persist.rehydrate(), []);

  const trackId = track?.id;
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (trackId === undefined) {
      audio.removeAttribute("src");
      audio.load();
    } else audio.src = `/api/stream/${trackId}`;
  }, [trackId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || trackId === undefined) return;
    // Browsers refuse to start audio without a click, e.g. straight after a reload.
    if (playing) audio.play().catch(() => usePlayer.getState().setPlaying(false));
    else audio.pause();
  }, [playing, trackId]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = track
      ? new MediaMetadata({
          title: track.title,
          artist: track.artistName,
          album: track.albumName,
          artwork: [{ src: `/api/cover/album/${track.albumId}?size=512`, sizes: "512x512", type: "image/jpeg" }],
        })
      : null;
    navigator.mediaSession.setActionHandler("nexttrack", () => usePlayer.getState().next());
    navigator.mediaSession.setActionHandler("previoustrack", () => usePlayer.getState().previous());
  }, [track]);

  // Space plays and pauses, unless the key belongs to a control or a text field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.code !== "Space" || target.closest("input, textarea, select, button, a, [role], [contenteditable]")) return;
      event.preventDefault();
      const state = usePlayer.getState();
      state.setPlaying(!state.playing);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const duration = track?.duration ?? 0;
  const seek = (seconds: number) => {
    if (audioRef.current) audioRef.current.currentTime = seconds;
    setTime(seconds);
  };
  const transport = { playing, disabled: !track, onToggle: () => setPlaying(!playing), onNext: next, onPrevious: previous };

  return (
    <footer id="player-bar" className="bg-sidebar relative z-50 flex h-(--player-height) shrink-0 items-center gap-3 border-t px-3 sm:px-4">
      <audio
        ref={audioRef}
        preload="auto"
        onLoadStart={() => {
          loads.current++;
          setTime(0);
        }}
        onTimeUpdate={(event) => {
          const now = event.currentTarget.currentTime;
          setTime(now);
          if (track && recordedLoad.current !== loads.current && now > 0 && now >= playedAfter(track.duration)) {
            recordedLoad.current = loads.current;
            recordPlay.mutate({ trackId: track.id });
          }
        }}
        onEnded={(event) => {
          const before = usePlayer.getState().queue[usePlayer.getState().index]?.id;
          next();
          const after = usePlayer.getState();
          // The same track twice in a row doesn't reload, so it is restarted by hand.
          if (after.playing && after.queue[after.index]?.id === before) {
            event.currentTarget.currentTime = 0;
            void event.currentTarget.play();
          }
        }}
        onPlay={() => setPlaying(true)}
        // Paused from outside (media keys, headphones). Not the pause a track change causes while loading.
        onPause={(event) => {
          if (event.currentTarget.readyState > 0 && !event.currentTarget.ended) setPlaying(false);
        }}
        onError={() => {
          if (!track) return;
          setPlaying(false);
          toast.error(`Couldn't play ${track.title}.`);
        }}
      />

      {/* Phones: a hairline of progress along the top instead of the scrubber. */}
      <div
        className="bg-brand absolute top-0 left-0 h-0.5 w-full origin-left md:hidden"
        style={{ transform: `scaleX(${duration ? Math.min(time / duration, 1) : 0})` }}
      />

      <div className="flex min-w-0 flex-1 items-center gap-1 md:w-1/4 md:flex-none lg:w-1/3">
        {track ? (
          // Keyed by track, so each new one rises into place.
          <div key={track.id} className="animate-rise flex min-w-0 items-center gap-3">
            <Cover type="album" id={track.albumId} size={96} className="size-11" />
            <div className="min-w-0 max-md:hidden">
              <Link href={`/albums/${track.albumId}`} className="block truncate text-[13px] font-medium hover:underline">
                {track.title}
              </Link>
              <Link href={`/artists/${track.artistId}`} className="text-muted-foreground block truncate text-xs hover:underline">
                {track.artistName}
              </Link>
            </div>
            {/* Phones: the whole title opens Now playing. */}
            <button type="button" className="min-w-0 text-left outline-none md:hidden" onClick={() => setSheetOpen(true)}>
              <span className="block truncate text-[13px] font-medium">{track.title}</span>
              <span className="text-muted-foreground block truncate text-xs">{track.artistName}</span>
            </button>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Nothing on the deck</p>
        )}
        {track ? <LikeButton track={track} className="max-md:hidden" /> : null}
      </div>

      <div className="flex flex-col items-center gap-1 md:min-w-0 md:flex-1">
        <Transport {...transport} className="max-md:[&>[data-previous]]:hidden" />
        <Scrubber time={time} duration={duration} disabled={!track} onSeek={seek} className="max-w-xl max-md:hidden" />
      </div>

      <div className="flex items-center justify-end gap-1 md:w-1/4 lg:w-1/3">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Queue"
          aria-expanded={sheetOpen}
          className={cn("text-muted-foreground", sheetOpen && "bg-accent text-foreground")}
          onClick={() => setSheetOpen(!sheetOpen)}
        >
          <ListMusic />
        </Button>
        <div className="flex items-center gap-1 max-md:hidden">
          <Button variant="ghost" size="icon-sm" aria-label={volume ? "Mute" : "Unmute"} className="text-muted-foreground" onClick={toggleMute}>
            {volume === 0 ? <VolumeX /> : volume < 0.5 ? <Volume1 /> : <Volume2 />}
          </Button>
          <Slider aria-label="Volume" className="w-24" min={0} max={1} step={0.02} value={[volume]} onValueChange={([value]) => setVolume(value ?? 0)} />
        </div>
      </div>

      <NowPlaying open={sheetOpen} onOpenChange={setSheetOpen} track={track}>
        <Scrubber time={time} duration={duration} disabled={!track} onSeek={seek} />
        <Transport {...transport} large />
      </NowPlaying>
    </footer>
  );
}

/** Previous, play or pause, next. */
function Transport({
  playing,
  disabled,
  large = false,
  onToggle,
  onNext,
  onPrevious,
  className,
}: {
  playing: boolean;
  disabled: boolean;
  large?: boolean;
  onToggle: () => void;
  onNext: () => void;
  onPrevious: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-center", large ? "gap-5" : "gap-1 sm:gap-2", className)}>
      <Button data-previous variant="ghost" size={large ? "icon-lg" : "icon-sm"} aria-label="Previous" disabled={disabled} onClick={onPrevious}>
        <SkipBack className="fill-current" />
      </Button>
      <button
        type="button"
        aria-label={playing ? "Pause" : "Play"}
        disabled={disabled}
        onClick={onToggle}
        className={cn(
          "bg-foreground text-background focus-visible:ring-ring/50 grid place-items-center rounded-full outline-none transition-transform duration-150 hover:scale-105 focus-visible:ring-[3px] active:scale-95 disabled:opacity-40 disabled:hover:scale-100",
          large ? "size-14" : "size-8",
        )}
      >
        {/* Starting playback gets a pop; pausing just swaps the icon. */}
        <span key={String(playing)} className={cn("grid place-items-center", playing && "animate-pop")}>
          {playing ? (
            <Pause className={cn("fill-current", large ? "size-5" : "size-3.5")} />
          ) : (
            <Play className={cn("translate-x-px fill-current", large ? "size-5" : "size-3.5")} />
          )}
        </span>
      </button>
      <Button variant="ghost" size={large ? "icon-lg" : "icon-sm"} aria-label="Next" disabled={disabled} onClick={onNext}>
        <SkipForward className="fill-current" />
      </Button>
    </div>
  );
}

/** Elapsed time, the seek slider, and the track's length. Shows where a drag will land before it is let go. */
function Scrubber({
  time,
  duration,
  disabled,
  onSeek,
  className,
}: {
  time: number;
  duration: number;
  disabled: boolean;
  onSeek: (seconds: number) => void;
  className?: string;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  const shown = dragging ?? time;
  return (
    <div className={cn("text-muted-foreground flex w-full items-center gap-2 text-[11px] tabular-nums", className)}>
      <span className="w-9 text-right">{formatDuration(shown)}</span>
      <Slider
        tone="brand"
        aria-label="Seek"
        disabled={disabled}
        min={0}
        max={Math.max(duration, 1)}
        step={1}
        value={[Math.min(shown, duration)]}
        onValueChange={([value]) => setDragging(value ?? 0)}
        onValueCommit={([value]) => {
          onSeek(value ?? 0);
          setDragging(null);
        }}
      />
      <span className="w-9">{formatDuration(duration)}</span>
    </div>
  );
}

/**
 * The sheet behind the queue button. On a desktop it is the queue, sitting
 * above the bar and leaving it usable. On a phone it fills the screen and
 * adds the cover, scrubber and transport (passed as children) that the slim bar leaves out.
 */
function NowPlaying({
  open,
  onOpenChange,
  track,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  track: WebTrack | undefined;
  children: React.ReactNode;
}) {
  const queue = usePlayer((state) => state.queue);
  const index = usePlayer((state) => state.index);
  const { jump, remove, play } = usePlayer.getState();

  return (
    // Not modal: the player bar stays live while the queue is open.
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        className="w-full gap-0 outline-none md:bottom-(--player-height)! md:h-auto!"
        // Focus goes to the sheet itself, not to "Clear" just because it is the first control.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus();
        }}
        // Using the bar (skipping, the queue button itself) shouldn't count as clicking away.
        onInteractOutside={(event) => {
          if ((event.target as HTMLElement).closest("#player-bar")) event.preventDefault();
        }}
      >
        <SheetHeader className="border-b">
          <SheetTitle>
            <span className="md:hidden">Now playing</span>
            <span className="max-md:hidden">Queue</span>
          </SheetTitle>
          <SheetDescription className="flex items-center gap-3 text-xs">
            <span className="tabular-nums">{count(queue.length, "track")}</span>
            {queue.length ? (
              <button type="button" className="hover:text-foreground underline-offset-4 hover:underline" onClick={() => play([])}>
                Clear
              </button>
            ) : null}
          </SheetDescription>
        </SheetHeader>

        {track ? (
          <div className="flex flex-col gap-4 border-b p-5 md:hidden">
            <Cover key={track.albumId} type="album" id={track.albumId} size={640} className="animate-rise mx-auto w-full max-w-64" />
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{track.title}</p>
                <p className="text-muted-foreground truncate text-sm">{track.artistName}</p>
              </div>
              <LikeButton track={track} />
            </div>
            {children}
          </div>
        ) : null}

        {queue.length ? (
          <ol className="no-scrollbar flex-1 overflow-y-auto p-2">
            {queue.map((item, i) => (
              <li key={`${item.id}-${i}`} className="group hover:bg-accent/50 flex items-center gap-2 rounded-md pr-1 transition-colors">
                <button type="button" className="min-w-0 flex-1 px-2 py-1.5 text-left outline-none" onClick={() => jump(i)}>
                  <p className={cn("truncate text-sm", i === index && "text-brand-text")}>{item.title}</p>
                  <p className="text-muted-foreground truncate text-xs">{item.artistName}</p>
                </button>
                <span className="text-muted-foreground text-xs tabular-nums">{formatDuration(item.duration)}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${item.title} from queue`}
                  className="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                  onClick={() => remove(i)}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground p-4 text-sm">The queue is empty. Line something up.</p>
        )}
      </SheetContent>
    </Sheet>
  );
}
