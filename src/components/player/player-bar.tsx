"use client";

import Link from "next/link";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ListMusic, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume1, Volume2, VolumeX, X } from "lucide-react";
import { toast } from "sonner";

import { Cover } from "~/components/library/cover";
import { LikeButton } from "~/components/library/like-button";
import { Button } from "~/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "~/components/ui/sheet";
import { Slider } from "~/components/ui/slider";
import { count, formatDuration } from "~/lib/format";
import { cn } from "~/lib/utils";
import type { WebTrack } from "~/server/api/routers/library";
import { webStreamUrl, type StreamDecision } from "~/server/media/transcode";
import { useTRPC } from "~/trpc/react";
import { levelFor, usePlayback } from "./playback";
import { useSelection } from "./selection";
import { usePlayer } from "./store";
import { StreamControl } from "./stream-control";

/** A play counts once the listener is this far in: half the track, or four minutes. */
const playedAfter = (duration: number) => Math.min(duration / 2, 240);

/** How the audio element's clock maps onto the track it is playing. */
type Clock = {
  /** Seconds into the track where the loaded stream starts. Only a converted stream starts anywhere but 0. */
  offset: number;
  /** Where to move a file to once enough of it has loaded to seek. */
  seekOnLoad: number | null;
};

/** Previous goes back a track only this early in one, in seconds. Later than that it starts the track over. */
const restartAfter = 3;

/** How far into the track the element is, in seconds. */
const positionOf = (clock: Clock, audio: HTMLAudioElement) => clock.seekOnLoad ?? clock.offset + audio.currentTime;

/** Starts the element. Browsers refuse without a click, straight after a page reload say, and the player then shows paused. */
function start(audio: HTMLAudioElement) {
  audio.play().catch((error: unknown) => {
    // Being cut short by the next load or a pause also fails, and isn't a refusal.
    if (error instanceof DOMException && error.name === "NotAllowedError") usePlayer.getState().setPlaying(false);
  });
}

/**
 * Points the element at a track's stream `at` seconds in, starts it if the
 * player is playing, and returns the clock for it. A converted stream has no
 * length and can't be sought, so it is asked for from `at` and the element
 * counts on from there. A file is sent whole and moved to `at` once it has loaded.
 */
function loadStream(audio: HTMLAudioElement, trackId: number, sent: StreamDecision, at: number): Clock {
  audio.src = webStreamUrl(trackId, sent, at);
  if (usePlayer.getState().playing) start(audio);
  return sent.transcode ? { offset: at, seekOnLoad: null } : { offset: 0, seekOnLoad: at > 0 ? at : null };
}

/**
 * The bar across the bottom of the app, and the only audio element. It
 * follows the player store: a new current track loads, `playing` plays or
 * pauses, and the playback preferences decide what is asked for and how loud
 * it is. Media keys and lock-screen controls (skip, and seeking where the
 * device offers it) work through the Media Session API.
 *
 * A file the browser turns out not to play is asked for again as a
 * conversion, once, and only a conversion that fails is reported.
 *
 * Phones get a slimmer bar (title, play, next); tapping it opens the Now
 * playing sheet, which has the scrubber, the full transport and the queue.
 */
export function PlayerBar() {
  const trpc = useTRPC();
  const audioRef = useRef<HTMLAudioElement>(null);
  const { track, sent } = usePlayback();
  const playing = usePlayer((state) => state.playing);
  const volume = usePlayer((state) => state.volume);
  const normalise = usePlayer((state) => state.normalise);
  const { next, previous, setPlaying, setVolume, toggleMute, markUnplayable } = usePlayer.getState();
  const [time, setTime] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const clock = useRef<Clock>({ offset: 0, seekOnLoad: null });
  /** The track the element has loaded, to tell a new play from the same one loaded again. */
  const loadedTrack = useRef<number | undefined>(undefined);
  /** Counts plays, so each is recorded once however often its stream is loaded (a seek, a change of quality). */
  const plays = useRef(0);
  const recordedPlay = useRef(0);
  const recordPlay = useMutation(trpc.library.recordPlay.mutationOptions());

  // The saved queue and preferences are read after mount so the first render matches the server's.
  useEffect(() => void usePlayer.persist.rehydrate(), []);

  /** Loads the current track's stream from `at` seconds in. */
  const load = (audio: HTMLAudioElement, at: number) => {
    if (track && sent) clock.current = loadStream(audio, track.id, sent, at);
  };

  const trackId = track?.id;
  // Where the current track streams from. It changes with the track, and with what the track is sent as.
  const source = track && sent ? webStreamUrl(track.id, sent) : null;
  const onSource = useEffectEvent((audio: HTMLAudioElement) => {
    if (!track) {
      loadedTrack.current = undefined;
      audio.removeAttribute("src");
      audio.load();
      return;
    }
    // The same track from another address is a change of quality or format, or a file that failed and is now converted. Not a new play: it carries on from where it was.
    const samePlay = loadedTrack.current === track.id;
    if (!samePlay) plays.current++;
    loadedTrack.current = track.id;
    load(audio, samePlay && !audio.ended ? positionOf(clock.current, audio) : 0);
  });
  useEffect(() => {
    if (audioRef.current) onSource(audioRef.current);
  }, [source]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || trackId === undefined) return;
    if (playing) start(audio);
    else audio.pause();
  }, [playing, trackId]);

  const level = track ? levelFor(track, normalise) : 1;
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume * level;
  }, [volume, level]);

  // Space plays and pauses, and digits then Enter pick a numbered row, unless
  // the key belongs to a control or a text field.
  useEffect(() => {
    let idle: ReturnType<typeof setTimeout> | undefined;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (target.closest("input, textarea, select, [contenteditable], [role=menu], [role=listbox], [role=dialog], [role=slider]")) return;
      const selection = useSelection.getState();

      if (/^[0-9]$/.test(event.key)) {
        selection.type(event.key);
        // A number left half typed is forgotten after a few seconds.
        clearTimeout(idle);
        idle = setTimeout(selection.clear, 4000);
      } else if (selection.typed && event.key === "Enter") {
        // Enter belongs to the selection while one is being typed, even with a button focused.
        event.preventDefault();
        selection.commit();
      } else if (selection.typed && event.key === "Backspace") selection.back();
      else if (selection.typed && event.key === "Escape") selection.clear();
      else if (event.code === "Space" && !target.closest("button, a, [role]")) {
        event.preventDefault();
        const state = usePlayer.getState();
        state.setPlaying(!state.playing);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(idle);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const duration = track?.duration ?? 0;
  const seek = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !sent) return;
    // A converted stream can't be sought, so it is loaded again from there.
    if (sent.transcode) load(audio, seconds);
    // A file that hasn't loaded far enough to seek is moved when it has.
    else if (audio.readyState === 0) clock.current = { offset: 0, seekOnLoad: seconds };
    else audio.currentTime = seconds;
    setTime(seconds);
  };
  /** Previous, the way every player does it: back a track from the start of one, otherwise back to the start of this one. */
  const back = () => {
    const audio = audioRef.current;
    if (audio && usePlayer.getState().index > 0 && positionOf(clock.current, audio) <= restartAfter) return previous();
    seek(0);
    setPlaying(true);
  };
  const onBack = useEffectEvent(back);
  const onSeek = useEffectEvent(seek);
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
    navigator.mediaSession.setActionHandler("previoustrack", () => onBack());
    navigator.mediaSession.setActionHandler("seekto", ({ seekTime }) => {
      if (seekTime !== undefined) onSeek(seekTime);
    });
  }, [track]);

  const transport = { playing, disabled: !track, onToggle: () => setPlaying(!playing), onNext: next, onPrevious: back };

  return (
    // Always the night cabinet, so the lamps read the same at any hour.
    <footer id="player-bar" className="night bg-muted relative z-50 flex h-(--player-height) shrink-0 items-center gap-2.5 border-t px-3 sm:gap-3.5 sm:px-4">
      <audio
        ref={audioRef}
        preload="auto"
        onLoadStart={(event) => setTime(positionOf(clock.current, event.currentTarget))}
        onLoadedMetadata={(event) => {
          const { seekOnLoad } = clock.current;
          if (seekOnLoad === null) return;
          clock.current = { offset: 0, seekOnLoad: null };
          event.currentTarget.currentTime = seekOnLoad;
        }}
        onTimeUpdate={(event) => {
          const now = positionOf(clock.current, event.currentTarget);
          setTime(now);
          if (track && recordedPlay.current !== plays.current && now > 0 && now >= playedAfter(track.duration)) {
            recordedPlay.current = plays.current;
            recordPlay.mutate({ trackId: track.id });
          }
        }}
        onEnded={(event) => {
          const ended = usePlayer.getState();
          const before = ended.queue[ended.index]?.id;
          // Repeating one track stays on it; the restart below does the rest.
          if (ended.repeat !== "one") next();
          const after = usePlayer.getState();
          if (after.queue[after.index]?.id !== before) return;
          if (after.playing) {
            // The same track twice in a row doesn't load again, so it is restarted by hand, as a new play.
            plays.current++;
            seek(0);
            start(event.currentTarget);
          } else if (sent?.transcode) {
            // The queue ran out. Playing a finished file starts it over; a converted stream has to be loaded again to do that.
            seek(0);
          }
        }}
        onPlay={() => setPlaying(true)}
        // Paused from outside (media keys, headphones). Not the pause a track change causes while loading.
        onPause={(event) => {
          if (event.currentTarget.readyState > 0 && !event.currentTarget.ended) setPlaying(false);
        }}
        onError={(event) => {
          if (!track || !sent) return;
          const code = event.currentTarget.error?.code;
          // The browser said it plays this kind of file and then couldn't load or decode this one. Marking it
          // changes what it is sent as, so it loads again as a conversion and carries on from where it was.
          // That can happen once a track: a marked track is never sent as it is, so its next failure is reported.
          if (!sent.transcode && (code === MediaError.MEDIA_ERR_DECODE || code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED)) {
            markUnplayable(track.id);
            return;
          }
          setPlaying(false);
          toast.error(`Couldn't play ${track.title}.`);
        }}
      />

      {/* Phones: a hairline of progress along the top instead of the scrubber. */}
      <div
        className="bg-lamp absolute top-0 left-0 h-0.5 w-full origin-left md:hidden"
        style={{ transform: `scaleX(${duration ? Math.min(time / duration, 1) : 0})` }}
      />

      <TypedSelection />

      <div className="flex min-w-0 flex-1 items-center gap-2.5 md:w-64 md:flex-none lg:w-72">
        {track ? (
          // Keyed by track, so each new one rises into place.
          <div key={track.id} className="animate-rise flex min-w-0 flex-1 items-center gap-2.5">
            <Cover type="album" id={track.albumId} size={96} className="size-11 max-sm:hidden" />
            {/* The track as a title strip: name on ivory, artist on the band. */}
            <div className="print min-w-0 flex-1 overflow-hidden rounded-[3px] max-md:hidden">
              <Link href={`/albums/${track.albumId}`} className="t-label block truncate px-2 text-[12.5px] leading-6 hover:underline">
                {track.title}
              </Link>
              <Link href={`/artists/${track.artistId}`} className="bg-brand block truncate px-2 text-xs leading-5 font-medium hover:underline">
                {track.artistName}
              </Link>
            </div>
            {/* Phones: the whole strip opens Now playing. */}
            <button type="button" className="print min-w-0 flex-1 overflow-hidden rounded-[3px] text-left outline-none md:hidden" onClick={() => setSheetOpen(true)}>
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
      <Scrubber time={time} duration={duration} disabled={!track} onSeek={seek} tone="lamp" className="min-w-0 flex-1 max-md:hidden" />

      <div className="flex items-center justify-end gap-1">
        <StreamControl className="max-md:hidden" />
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
        <div className="flex items-center gap-1 max-lg:hidden">
          <Button variant="ghost" size="icon-sm" aria-label={volume ? "Mute" : "Unmute"} className="text-muted-foreground" onClick={toggleMute}>
            {volume === 0 ? <VolumeX /> : volume < 0.5 ? <Volume1 /> : <Volume2 />}
          </Button>
          <Slider aria-label="Volume" className="w-24" min={0} max={1} step={0.02} value={[volume]} onValueChange={([value]) => setVolume(value ?? 0)} />
        </div>
      </div>

      <NowPlaying open={sheetOpen} onOpenChange={setSheetOpen} track={track}>
        <Scrubber time={time} duration={duration} disabled={!track} onSeek={seek} />
        <Transport {...transport} large />
        {/* The settings page would open behind the sheet, so following the link to it closes the sheet. */}
        <StreamControl className="self-center" onNavigate={() => setSheetOpen(false)} />
      </NowPlaying>
    </footer>
  );
}

/**
 * The number being typed to pick a row, in amber on dark glass just above the
 * deck. It is only there while a number is being typed, and rolls once for
 * each digit.
 */
function TypedSelection() {
  const typed = useSelection((state) => state.typed);
  if (!typed) return null;
  return (
    <div role="status" className="bg-glass animate-rise absolute bottom-full left-3 mb-2 rounded-[5px] px-2.5 pt-1 pb-0.5 text-center shadow-[inset_0_0_0_1px_var(--cab-line)]">
      <span className="t-label text-muted-foreground block text-[9.5px] tracking-[0.1em]">Select</span>
      <span key={typed} className="t-num animate-roll text-lamp block text-[26px] tracking-[0.06em]">
        {typed}
      </span>
    </div>
  );
}

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
  const shuffle = usePlayer((state) => state.lineup !== null);
  const repeat = usePlayer((state) => state.repeat);
  const { toggleShuffle, cycleRepeat } = usePlayer.getState();
  return (
    <div className={cn("flex shrink-0 items-center justify-center", large ? "gap-3" : "gap-1.5", className)}>
      <ModeKey label={shuffle ? "Shuffle is on" : "Shuffle"} lit={shuffle} large={large} onClick={toggleShuffle}>
        <Shuffle />
      </ModeKey>
      <Button data-wide size={large ? "icon-lg" : "icon-sm"} aria-label="Previous" disabled={disabled} onClick={onPrevious}>
        <SkipBack className="fill-current" />
      </Button>
      {/* The one coral key on the deck. */}
      <Button
        variant="brand"
        aria-label={playing ? "Pause" : "Play"}
        disabled={disabled}
        onClick={onToggle}
        className={large ? "h-12 w-16" : "h-9 w-11"}
      >
        {playing ? <Pause className={cn("fill-current", large && "size-5")} /> : <Play className={cn("fill-current", large && "size-5")} />}
      </Button>
      <Button size={large ? "icon-lg" : "icon-sm"} aria-label="Next" disabled={disabled} onClick={onNext}>
        <SkipForward className="fill-current" />
      </Button>
      <ModeKey label={repeat === "one" ? "Repeating this track" : repeat === "all" ? "Repeating the queue" : "Repeat"} lit={repeat !== "off"} large={large} onClick={cycleRepeat}>
        {repeat === "one" ? <Repeat1 /> : <Repeat />}
      </ModeKey>
    </div>
  );
}

/**
 * Elapsed time, the seek slider, and the track's length. A drag shows where it
 * will land and seeks when it is let go; an arrow key seeks straight away.
 */
function Scrubber({
  time,
  duration,
  disabled,
  onSeek,
  tone,
  className,
}: {
  time: number;
  duration: number;
  disabled: boolean;
  onSeek: (seconds: number) => void;
  /** Amber on the deck; left out on print, where ink reads better. */
  tone?: "lamp";
  className?: string;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  // Only a pointer drag has a "let go". For a key press the slider reports the commit before the change, so the two can't share a path.
  const pointerDown = useRef(false);
  const shown = dragging ?? time;
  return (
    <div className={cn("text-muted-foreground flex w-full items-center gap-2 text-[11px] tabular-nums", className)}>
      <span className="w-9 text-right">{formatDuration(shown)}</span>
      <Slider
        tone={tone}
        aria-label="Seek"
        disabled={disabled}
        min={0}
        max={Math.max(duration, 1)}
        step={1}
        value={[Math.min(shown, duration)]}
        onPointerDown={() => {
          pointerDown.current = true;
        }}
        onValueChange={([value]) => {
          if (pointerDown.current) setDragging(value ?? 0);
          else onSeek(value ?? 0);
        }}
        onValueCommit={([value]) => {
          if (!pointerDown.current) return;
          pointerDown.current = false;
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
 * adds the cover, and the scrubber, transport and playback settings (passed
 * as children) that the slim bar leaves out.
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
  const playing = usePlayer((state) => state.playing);
  // The queue opens on the track that is playing, with what comes next below it, and follows it from one track to the
  // next. A ref, not an effect: the sheet's rows don't exist yet when `open` turns true.
  const showCurrent = useCallback((row: HTMLLIElement | null) => row?.scrollIntoView({ block: "start" }), []);

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
        // Using the bar (skipping, the queue button itself, its playback settings) shouldn't count as clicking away.
        onInteractOutside={(event) => {
          if ((event.target as HTMLElement).closest("#player-bar, [data-player-settings]")) event.preventDefault();
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
              <LikeButton key={track.id} track={track} />
            </div>
            {children}
          </div>
        ) : null}

        {queue.length ? (
          <ol className="no-scrollbar flex-1 overflow-y-auto p-2">
            {queue.map((item, i) => (
              <li
                key={`${item.id}-${i}`}
                ref={i === index ? showCurrent : undefined}
                aria-current={i === index ? "true" : undefined}
                className="group hover:bg-accent/50 flex scroll-mt-1 items-center gap-2 rounded-md pr-1 pl-2 transition-colors"
              >
                <span className="lamp" data-lit={i === index && playing} />
                <button type="button" className="min-w-0 flex-1 px-1 py-1.5 text-left outline-none" onClick={() => jump(i)}>
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
