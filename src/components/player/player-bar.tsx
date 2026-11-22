"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ListMusic, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX, X } from "lucide-react";
import { toast } from "sonner";

import { Cover } from "~/components/library/cover";
import { Button } from "~/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "~/components/ui/sheet";
import { Slider } from "~/components/ui/slider";
import { count, formatDuration } from "~/lib/format";
import { cn } from "~/lib/utils";
import { useTRPC } from "~/trpc/react";
import { useCurrentTrack, usePlayer } from "./store";

/** A play counts once the listener is this far in: half the track, or four minutes. */
const playedAfter = (duration: number) => Math.min(duration / 2, 240);

/**
 * The bar across the bottom of the app, and the only audio element. It
 * follows the player store: a new current track loads, `playing` plays or
 * pauses. Media keys and lock-screen controls work through the Media Session API.
 */
export function PlayerBar() {
  const trpc = useTRPC();
  const audioRef = useRef<HTMLAudioElement>(null);
  const track = useCurrentTrack();
  const playing = usePlayer((state) => state.playing);
  const volume = usePlayer((state) => state.volume);
  const { next, previous, setPlaying, setVolume } = usePlayer.getState();
  const [time, setTime] = useState(0);
  /** Where the scrubber is being dragged to, until it is let go. */
  const [scrubbing, setScrubbing] = useState<number | null>(null);
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
  const shown = scrubbing ?? time;

  return (
    <footer className="bg-sidebar relative z-50 flex h-(--player-height) shrink-0 items-center gap-3 border-t px-3 sm:px-4">
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
      <div className="bg-brand absolute top-0 left-0 h-0.5 md:hidden" style={{ width: duration ? `${(shown / duration) * 100}%` : 0 }} />

      <div className="flex min-w-0 flex-1 items-center gap-3 md:w-1/4 md:flex-none lg:w-1/3">
        {track ? (
          <>
            <Cover type="album" id={track.albumId} size={96} className="size-11" />
            <div className="min-w-0">
              <Link href={`/albums/${track.albumId}`} className="block truncate text-[13px] font-medium hover:underline">
                {track.title}
              </Link>
              <Link href={`/artists/${track.artistId}`} className="text-muted-foreground block truncate text-xs hover:underline">
                {track.artistName}
              </Link>
            </div>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">Nothing playing</p>
        )}
      </div>

      <div className="flex flex-col items-center gap-1 md:min-w-0 md:flex-1">
        <div className="flex items-center gap-1 sm:gap-2">
          <Button variant="ghost" size="icon-sm" aria-label="Previous" disabled={!track} onClick={previous} className="max-md:hidden">
            <SkipBack className="fill-current" />
          </Button>
          <button
            type="button"
            aria-label={playing ? "Pause" : "Play"}
            disabled={!track}
            onClick={() => setPlaying(!playing)}
            className="bg-foreground text-background focus-visible:ring-ring/50 grid size-8 place-items-center rounded-full outline-none focus-visible:ring-[3px] disabled:opacity-40"
          >
            {playing ? <Pause className="size-3.5 fill-current" /> : <Play className="size-3.5 translate-x-px fill-current" />}
          </button>
          <Button variant="ghost" size="icon-sm" aria-label="Next" disabled={!track} onClick={next}>
            <SkipForward className="fill-current" />
          </Button>
        </div>
        <div className="text-muted-foreground flex w-full max-w-xl items-center gap-2 text-[11px] tabular-nums max-md:hidden">
          <span className="w-9 text-right">{formatDuration(shown)}</span>
          <Slider
            tone="brand"
            aria-label="Seek"
            disabled={!track}
            min={0}
            max={Math.max(duration, 1)}
            step={1}
            value={[Math.min(shown, duration)]}
            onValueChange={([value]) => setScrubbing(value ?? 0)}
            onValueCommit={([value]) => {
              if (audioRef.current && value !== undefined) audioRef.current.currentTime = value;
              setTime(value ?? 0);
              setScrubbing(null);
            }}
          />
          <span className="w-9">{formatDuration(duration)}</span>
        </div>
      </div>

      <div className="flex items-center justify-end gap-1 md:w-1/4 lg:w-1/3">
        <Queue />
        <div className="flex items-center gap-1 max-md:hidden">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={volume ? "Mute" : "Unmute"}
            className="text-muted-foreground"
            onClick={() => setVolume(volume ? 0 : 1)}
          >
            {volume ? <Volume2 /> : <VolumeX />}
          </Button>
          <Slider aria-label="Volume" className="w-24" min={0} max={1} step={0.02} value={[volume]} onValueChange={([value]) => setVolume(value ?? 0)} />
        </div>
      </div>
    </footer>
  );
}

/** The queue, in a sheet: jump to a track, or take one out. */
function Queue() {
  const queue = usePlayer((state) => state.queue);
  const index = usePlayer((state) => state.index);
  const { jump, remove, play } = usePlayer.getState();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Queue" className="text-muted-foreground">
          <ListMusic />
        </Button>
      </SheetTrigger>
      <SheetContent className="gap-0">
        <SheetHeader className="border-b">
          <SheetTitle>Queue</SheetTitle>
          <div className="text-muted-foreground flex items-center gap-3 text-xs">
            <span className="tabular-nums">{count(queue.length, "track")}</span>
            {queue.length ? (
              <button type="button" className="hover:text-foreground underline-offset-4 hover:underline" onClick={() => play([])}>
                Clear
              </button>
            ) : null}
          </div>
        </SheetHeader>
        {queue.length ? (
          <ol className="no-scrollbar flex-1 overflow-y-auto p-2">
            {queue.map((track, i) => (
              <li key={`${track.id}-${i}`} className="group hover:bg-accent/50 flex items-center gap-2 rounded-md pr-1">
                <button type="button" className="min-w-0 flex-1 px-2 py-1.5 text-left outline-none" onClick={() => jump(i)}>
                  <p className={cn("truncate text-sm", i === index && "text-brand-text")}>{track.title}</p>
                  <p className="text-muted-foreground truncate text-xs">{track.artistName}</p>
                </button>
                <span className="text-muted-foreground text-xs tabular-nums">{formatDuration(track.duration)}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${track.title} from queue`}
                  className="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                  onClick={() => remove(i)}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground p-4 text-sm">Nothing queued.</p>
        )}
      </SheetContent>
    </Sheet>
  );
}
