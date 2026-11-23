"use client";

import Link from "next/link";
import { memo, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Maximize2, Minimize2, X } from "lucide-react";
import { create } from "zustand";

import { Cover } from "~/components/library/cover";
import { LikeButton } from "~/components/library/like-button";
import { formatDuration } from "~/lib/format";
import { cn } from "~/lib/utils";
import type { WebTrack } from "~/server/api/routers/library";
import { useTRPC } from "~/trpc/react";
import { nowPlayingLayer } from "./now-playing-layer";
import { sentLabel, usePlayback } from "./playback";
import { Scrubber } from "./scrubber";
import { usePlayer } from "./store";
import { Transport } from "./transport";

type Mode = "detailed" | "minimal";
const modeKey = "crate-now-playing";

/** Whether Now playing is open, and which way it is shown. The way is kept in the browser, so it opens as it was left. */
export const useNowPlayingView = create<{ open: boolean; mode: Mode; toggle: () => void; close: () => void; setMode: (mode: Mode) => void }>()((set, get) => ({
  open: false,
  mode: "detailed",
  toggle: () => set({ open: !get().open, mode: readMode() }),
  close: () => set({ open: false }),
  setMode: (mode) => {
    try {
      window.localStorage.setItem(modeKey, mode);
    } catch {
      // Private windows can refuse storage; it then opens detailed next time.
    }
    set({ mode });
  },
}));

function readMode(): Mode {
  try {
    return window.localStorage.getItem(modeKey) === "minimal" ? "minimal" : "detailed";
  } catch {
    return "detailed";
  }
}

const subscribeNothing = () => () => {};
/** Below this a phone's sheet stands in for Now playing. Matches the console's own breakpoint. */
export const phoneQuery = "(max-width: 47.99rem)";

/**
 * What the queue was played from, in words: "Low Tide Radio", "Late", "Most
 * played". Worked out from the source's own id, so tracks added to the queue
 * from elsewhere don't change it.
 */
function useFromLabel(from: string | null) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const queue = usePlayer((state) => state.queue);
  if (!from) return "The queue";
  const [kind, id] = from.split(":");
  if (kind === "album") return queue.find((item) => String(item.albumId) === id)?.albumName ?? "An album";
  if (kind === "artist") return queue.find((item) => String(item.artistId) === id)?.artistName ?? "An artist";
  if (kind === "most-played") return "Most played";
  if (kind === "liked") return "Liked";
  if (kind === "playlist") return queryClient.getQueryData(trpc.playlists.tree.queryKey())?.playlists.find((row) => String(row.id) === id)?.name ?? "A playlist";
  return "The queue";
}

/**
 * Now playing, over the glass: the track that is playing, large. Two ways to
 * see it, switched at the top and remembered:
 *  - Detailed: the cover lit amber in its own column; the name lettered big,
 *    the waveform in a tall window of glass to seek on, the keys, and
 *    everything known about the file and your plays; up next down the right.
 *  - Minimal: the art, blurred and dimmed, is the whole ground. The cover,
 *    the name, a thin waveform and three keys, which fade after a few still
 *    seconds and come back with the pointer. F takes it to full screen.
 * Escape, V or the close key put it away. Rendered by the console, which has
 * the clock and the seek, into the layer the shell sets out over the glass.
 */
export function NowPlayingView({
  track,
  time,
  duration,
  playing,
  onSeek,
  onPrevious,
}: {
  track: WebTrack | undefined;
  time: number;
  duration: number;
  playing: boolean;
  onSeek: (seconds: number) => void;
  onPrevious: () => void;
}) {
  const open = useNowPlayingView((state) => state.open);
  const mode = useNowPlayingView((state) => state.mode);
  const { close, setMode } = useNowPlayingView.getState();
  const panel = useRef<HTMLDivElement>(null);
  // The layer only exists in the browser.
  const layer = useSyncExternalStore(
    subscribeNothing,
    () => document.getElementById(nowPlayingLayer),
    () => null,
  );

  // Nothing left to show: it puts itself away. So does a screen narrowing to a phone's, which has its own sheet.
  useEffect(() => {
    if (open && !track) close();
  }, [open, track, close]);
  useEffect(() => {
    if (!open) return;
    const phone = window.matchMedia(phoneQuery);
    const onChange = () => phone.matches && close();
    onChange();
    phone.addEventListener("change", onChange);
    return () => phone.removeEventListener("change", onChange);
  }, [open, close]);

  // While open it has the keyboard: the page under it can't be reached, and the focus goes back where it came from.
  useEffect(() => {
    if (!open || !layer) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const page = layer.parentElement?.querySelector("main");
    page?.setAttribute("inert", "");
    panel.current?.focus({ preventScroll: true });
    return () => {
      page?.removeAttribute("inert");
      const back = opener?.isConnected && !page?.contains(opener) ? opener : document.querySelector<HTMLElement>("#player-bar [aria-keyshortcuts='V']");
      back?.focus({ preventScroll: true });
    };
  }, [open, layer]);

  /** Into or out of full screen, where the browser allows it; a refusal changes nothing. */
  const toggleFullscreen = () => {
    if (!document.fullscreenEnabled) return;
    void (document.fullscreenElement ? document.exitFullscreen() : panel.current?.requestFullscreen())?.catch(() => {});
  };
  const choose = (next: Mode) => {
    // Full screen belongs to Minimal; Detailed has no way out of it.
    if (next === "detailed" && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    setMode(next);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      // Its own keys work anywhere in it; a field, a menu or another dialog keeps them.
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable], [role=menu], [role=listbox], [role=dialog]:not([data-queue])")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Escape" && !document.fullscreenElement) close();
      if ((event.key === "f" || event.key === "F") && useNowPlayingView.getState().mode === "minimal") {
        event.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!open || !track || !layer) return null;
  const bar = (
    <div className="flex items-center gap-3 px-4 pt-3 sm:px-6 lg:px-8">
      <h2 className={cn("t-label text-[12px]", mode === "minimal" && "sr-only")}>Now playing</h2>
      <div role="group" aria-label="Show" className="glass-inset flex rounded-md p-0.5">
        {(["detailed", "minimal"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={mode === option}
            onClick={() => choose(option)}
            className={cn(
              "t-label focus-visible:ring-ring/60 rounded-[4px] px-2.5 py-1.5 text-[11px] outline-none transition-colors focus-visible:ring-[3px]",
              mode === option ? "print" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option}
          </button>
        ))}
      </div>
      <span className="flex-1" />
      {mode === "minimal" && document.fullscreenEnabled ? (
        <button
          type="button"
          aria-label="Full screen"
          aria-keyshortcuts="F"
          onClick={toggleFullscreen}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 grid size-8 place-items-center rounded-md outline-none focus-visible:ring-[3px]"
        >
          <Maximize2 className="size-4" />
        </button>
      ) : null}
      <button
        type="button"
        aria-label="Close Now playing"
        aria-keyshortcuts="Escape V"
        onClick={close}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 grid size-8 place-items-center rounded-md outline-none focus-visible:ring-[3px]"
      >
        <X className="size-4" />
      </button>
    </div>
  );

  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-modal="false"
      tabIndex={-1}
      aria-label={`Now playing: ${track.title}, ${track.artistName}`}
      // Marks the one dialog the deck's keys still work in, as the queue is.
      data-queue
      className="glass animate-arrive absolute inset-0 z-10 flex flex-col overflow-hidden bg-(--glass) outline-none"
    >
      {mode === "detailed" ? (
        <Detailed track={track} time={time} duration={duration} playing={playing} onSeek={onSeek} onPrevious={onPrevious} bar={bar} />
      ) : (
        <Minimal track={track} time={time} duration={duration} playing={playing} onSeek={onSeek} onPrevious={onPrevious} bar={bar} />
      )}
    </div>,
    layer,
  );
}

type ViewProps = {
  track: WebTrack;
  time: number;
  duration: number;
  playing: boolean;
  onSeek: (seconds: number) => void;
  onPrevious: () => void;
  bar: React.ReactNode;
};

/** Following a link out of Now playing puts it away, so the page it leads to isn't left behind it. */
const leave = (event: React.MouseEvent) => {
  if (!event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) useNowPlayingView.getState().close();
};

function Detailed({ track, time, duration, playing, onSeek, onPrevious, bar }: ViewProps) {
  const trpc = useTRPC();
  const from = usePlayer((state) => state.from);
  const fromLabel = useFromLabel(from);
  const { sent } = usePlayback();
  const extras = useQuery(trpc.library.trackRows.queryOptions({ trackIds: [track.id] }, { staleTime: 60_000 }));
  const plays = extras.data?.[track.id]?.plays ?? 0;
  const facts: [string, React.ReactNode][] = [
    ["Album", <Link key="album" href={`/albums/${track.albumId}`} onClick={leave} className="hover:underline">{track.albumName}</Link>],
    ["Artist", <Link key="artist" href={`/artists/${track.artistId}`} onClick={leave} className="hover:underline">{track.artistName}</Link>],
    ...(track.trackNumber ? [["Track", `${track.discNumber && track.discNumber > 1 ? `Disc ${track.discNumber}, ` : ""}${track.trackNumber}`] as [string, React.ReactNode]] : []),
    ["File", `${track.suffix.toUpperCase()}${track.bitRate ? ` · ${track.bitRate} kbps` : ""}`],
    ...(sent ? [["Sent as", sentLabel(track, sent)] as [string, React.ReactNode]] : []),
    // A queue saved before ReplayGain was kept can lack it altogether.
    ...(typeof track.trackGain === "number" ? [["ReplayGain", `${track.trackGain > 0 ? "+" : ""}${track.trackGain.toFixed(1)} dB`] as [string, React.ReactNode]] : []),
    ["Your plays", plays ? String(plays) : "None yet"],
    ["Playing from", fromLabel],
  ];

  return (
    <>
      {bar}
      <div className="grid min-h-0 flex-1 gap-x-8 gap-y-5 overflow-y-auto px-4 pt-4 pb-6 sm:px-6 lg:grid-cols-[minmax(14rem,20rem)_minmax(0,1fr)] lg:px-8 xl:grid-cols-[minmax(14rem,20rem)_minmax(0,1fr)_minmax(16rem,20rem)]">
        <div className="min-w-0 self-start max-lg:max-w-72">
          <Cover key={track.albumId} type="album" id={track.albumId} size={800} glow={playing ? "lit" : true} className="w-full" />
        </div>
        <div className="min-w-0">
          <p className="t-label text-muted-foreground text-[11px] tracking-[0.12em]">
            {track.trackNumber ? `Track ${track.trackNumber} · ` : ""}
            {track.albumName}
          </p>
          <h1 key={track.id} className="font-title animate-arrive mt-1.5 text-[40px] leading-[0.92] text-balance break-words lg:text-[56px]">
            {track.title}
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <Link href={`/artists/${track.artistId}`} onClick={leave} className="text-muted-foreground hover:text-foreground min-w-0 truncate text-[17px] hover:underline">
              {track.artistName}
            </Link>
            <LikeButton key={track.id} track={track} />
          </div>
          <div className="glass-inset mt-5 rounded-lg px-3 py-3">
            <Scrubber trackId={track.id} time={time} duration={duration} onSeek={onSeek} tone="lamp" size="lg" />
          </div>
          <Transport playing={playing} disabled={false} large onPrevious={onPrevious} className="mt-5 justify-start" />
          <dl className="mt-6 grid grid-cols-[7rem_minmax(0,1fr)] text-[13.5px]">
            {facts.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="t-label text-muted-foreground border-t py-2.5 text-[10.5px] leading-[1.3]">{label}</dt>
                <dd className="min-w-0 border-t py-2 break-words">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <UpNext className="lg:col-span-2 xl:col-span-1" />
      </div>
    </>
  );
}

/**
 * What comes after the track that is playing, on print. A row plays when it
 * is chosen. On its own and memoised, so the clock ticking doesn't draw it again.
 */
const UpNext = memo(function UpNext({ className }: { className?: string }) {
  const queue = usePlayer((state) => state.queue);
  const index = usePlayer((state) => state.index);
  const { jump } = usePlayer.getState();
  const next = queue.slice(index + 1, index + 9);
  const rest = queue.length - index - 1;
  const length = queue.slice(index + 1).reduce((sum, item) => sum + item.duration, 0);
  return (
    <section className={cn("print min-w-0 self-start rounded-lg px-4 pb-2", className)}>
      <h2 className="flex items-baseline gap-3 border-b-2 border-(--ink) pt-3 pb-2">
        <span className="t-label text-[12px]">Up next</span>
        {rest ? <span className="text-muted-foreground ml-auto text-xs tabular-nums">{rest} · {formatDuration(length)}</span> : null}
      </h2>
      {next.length ? (
        <ol>
          {next.map((item, i) => (
            <li key={`${item.id}-${index + 1 + i}`} className="border-b last:border-b-0">
              <button
                type="button"
                onClick={() => jump(index + 1 + i)}
                className="hover:bg-accent focus-visible:bg-accent grid w-full grid-cols-[1.25rem_2.25rem_minmax(0,1fr)_auto] items-center gap-2.5 py-1.5 text-left outline-none"
              >
                <span className="t-num text-muted-foreground text-[14px]">{i + 1}</span>
                <Cover type="album" id={item.albumId} size={72} className="size-9" />
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-medium">{item.title}</span>
                  <span className="text-muted-foreground block truncate text-xs">{item.artistName}</span>
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">{formatDuration(item.duration)}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-muted-foreground py-3 text-sm">Nothing after this one.</p>
      )}
    </section>
  );
});

/** How long the pointer has to be still before Minimal's keys step back. */
const idleMs = 3000;

function Minimal({ track, time, duration, playing, onSeek, onPrevious, bar }: ViewProps) {
  // The keys and the bar show while the pointer moves or the keyboard is used, and step back once it is still.
  const [awake, setAwake] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    const wake = () => {
      setAwake(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setAwake(false), idleMs);
    };
    wake();
    window.addEventListener("pointermove", wake);
    window.addEventListener("keydown", wake);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("keydown", wake);
    };
  }, []);
  const controls = cn("transition-opacity duration-500", awake ? "opacity-100" : "opacity-0 has-focus-visible:opacity-100");

  return (
    <>
      {/* The art itself, blurred and dimmed, is the ground. Drawn once per track; nothing on it moves. */}
      <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
        <Cover key={track.albumId} type="album" id={track.albumId} size={400} className="absolute -inset-[15%] size-[130%] scale-110 rounded-none opacity-55 blur-[60px]" />
        <div className="absolute inset-0 bg-[radial-gradient(70%_70%_at_50%_45%,transparent,rgb(7_26_29/0.85))]" />
        <div className="absolute inset-0 [background-image:var(--grain)] [background-size:160px] opacity-30 mix-blend-soft-light" />
      </div>
      <div className={controls}>{bar}</div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 px-6 pb-8">
        <Cover key={`cover-${track.albumId}`} type="album" id={track.albumId} size={800} glow={playing ? "lit" : true} className="w-[min(22rem,42vh,80%)] shadow-[0_30px_60px_-20px_rgb(0_0_0/0.9)]" />
        <h1 key={`title-${track.id}`} className="font-title animate-arrive mt-6 max-w-[40rem] text-center text-[34px] leading-none text-balance lg:text-[44px]">
          {track.title}
        </h1>
        <p className="text-muted-foreground mt-1.5 text-[16px]">{track.artistName}</p>
        <div className="mt-5 w-[min(28rem,90%)]">
          <Scrubber trackId={track.id} time={time} duration={duration} onSeek={onSeek} tone="lamp" />
        </div>
        <div className={cn("mt-3", controls)}>
          <Transport playing={playing} disabled={false} large onPrevious={onPrevious} className="[&>[data-wide][aria-pressed]]:hidden" />
        </div>
      </div>
    </>
  );
}

/** The key on the console that opens and closes Now playing. */
export function NowPlayingKey({ disabled, className }: { disabled: boolean; className?: string }) {
  const open = useNowPlayingView((state) => state.open);
  return (
    <button
      type="button"
      aria-label={open ? "Close Now playing" : "Now playing"}
      aria-keyshortcuts="V"
      aria-pressed={open}
      disabled={disabled}
      onClick={() => useNowPlayingView.getState().toggle()}
      className={cn(
        "focus-visible:ring-ring/60 grid size-7 place-items-center rounded-md outline-none transition-colors focus-visible:ring-[3px] disabled:opacity-50",
        open ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      {open ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
    </button>
  );
}
