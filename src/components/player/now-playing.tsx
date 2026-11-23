"use client";

import Link from "next/link";
import { memo, useCallback, useRef, useState } from "react";
import { GripVertical, X } from "lucide-react";

import { Cover } from "~/components/library/cover";
import { LikeButton } from "~/components/library/like-button";
import { Button } from "~/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "~/components/ui/sheet";
import { count, formatDuration } from "~/lib/format";
import { cn } from "~/lib/utils";
import type { WebTrack } from "~/server/api/routers/library";
import { usePlayer } from "./store";

/**
 * The sheet behind the queue button: the track that is playing, large, with
 * its cover, and the queue under it. On a desktop it sits above the deck and
 * leaves it usable. On a phone it fills the screen and also holds what the
 * slim bar leaves out: the scrubber and transport (`controls`) and the
 * playback settings (`settings`).
 *
 * It has no bar across the top. The cover starts the sheet, edge to edge,
 * with the close key on one corner and, on a phone, the settings on the
 * other. The name and artist are a tile's strip under it.
 */
export function NowPlaying({
  open,
  onOpenChange,
  track,
  returnFocusTo,
  controls,
  settings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  track: WebTrack | undefined;
  /** Where the keyboard goes back to when the sheet closes. */
  returnFocusTo: React.RefObject<HTMLElement | null>;
  controls: React.ReactNode;
  settings: React.ReactNode;
}) {
  const length = usePlayer((state) => state.queue.length);
  /** Whether the sheet is closing because something on the page was clicked, which then keeps the focus. */
  const clickedAway = useRef(false);
  /** Following a link from the sheet: on a phone the sheet covers the page it leads to, so it closes. */
  const leave = () => {
    if (window.matchMedia("(max-width: 47.99rem)").matches) onOpenChange(false);
  };

  return (
    // Not modal: the deck stays live while it is open.
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        // Marks the one dialog that Space and the other keys still work in.
        data-queue
        // A phone on its side has the whole width and little height: there the sheet is full width and the cover small.
        className="w-full gap-0 outline-none max-md:short:max-w-none! md:bottom-(--player-height)! md:h-auto!"
        showCloseButton={!track}
        // Focus goes to the sheet itself, not to the first control in it.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus();
        }}
        // Using the deck (skipping, the queue button itself, its playback settings) shouldn't count as clicking away.
        onInteractOutside={(event) => {
          if ((event.target as HTMLElement).closest("#player-bar, [data-player-settings]")) event.preventDefault();
          else clickedAway.current = true;
        }}
        // Closed from inside (Escape, the close key), the keyboard goes back to the queue button.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (!clickedAway.current) returnFocusTo.current?.focus();
          clickedAway.current = false;
        }}
      >
        {/* With a track there is no bar across the top: the cover starts the sheet, and the way out sits on its corner. */}
        <SheetHeader className={track ? "sr-only" : "border-b"}>
          <SheetTitle>Now playing</SheetTitle>
          <SheetDescription className="sr-only">The track that is playing, and what is queued after it.</SheetDescription>
        </SheetHeader>

        {track ? (
          <div className="border-b">
            <div className="relative short:hidden">
              {/* Edge to edge, and never so tall on a short screen that the queue is pushed off it. */}
              <Cover key={track.albumId} type="album" id={track.albumId} size={800} className="animate-rise max-h-[46dvh] w-full rounded-none" />
              <div className="print absolute top-2 left-2 rounded-md shadow-[0_1px_3px_rgb(0_0_0/0.3)] md:hidden">{settings}</div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => onOpenChange(false)}
                className="print focus-visible:ring-ring/60 absolute top-2 right-2 grid size-8 place-items-center rounded-md shadow-[0_1px_3px_rgb(0_0_0/0.3)] outline-none focus-visible:ring-[3px]"
              >
                <X className="size-4" />
              </button>
            </div>
            {/* The name and artist as a tile's strip, under the cover and as wide. On a short screen the cover is a
                thumbnail beside it, with the settings and the way out after it. */}
            <div className="flex items-stretch">
              <Cover key={`thumb-${track.albumId}`} type="album" id={track.albumId} size={160} className="hidden size-15 rounded-none short:grid" />
              <div key={track.id} className="animate-arrive min-w-0 flex-1">
                <div className="flex items-center pr-2">
                  <Link href={`/albums/${track.albumId}`} onClick={leave} className="t-label min-w-0 flex-1 truncate px-4 text-[13px] leading-9 hover:underline">
                    {track.title}
                  </Link>
                  <LikeButton key={track.id} track={track} />
                </div>
                <Link href={`/artists/${track.artistId}`} onClick={leave} className="bg-brand block truncate px-4 text-xs leading-6 font-medium hover:underline">
                  {track.artistName}
                </Link>
              </div>
              <div className="hidden items-center gap-1.5 px-2 short:flex">
                <div className="print rounded-md md:hidden">{settings}</div>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => onOpenChange(false)}
                  className="focus-visible:ring-ring/60 grid size-8 place-items-center rounded-md outline-none focus-visible:ring-[3px]"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-3 p-4 md:hidden">{controls}</div>
          </div>
        ) : null}

        <div className="text-muted-foreground flex items-center gap-3 border-b px-5 py-2 text-xs">
          <h3 className="t-label text-foreground text-[11px]">Queue</h3>
          <span className="tabular-nums">{count(length, "track")}</span>
          {length > 1 ? (
            <button
              type="button"
              className="hover:text-foreground focus-visible:text-foreground ml-auto underline-offset-4 outline-none hover:underline focus-visible:underline"
              onClick={usePlayer.getState().clear}
            >
              Clear
            </button>
          ) : null}
        </div>
        <QueueList />
      </SheetContent>
    </Sheet>
  );
}

const keys = new WeakMap<WebTrack, number>();
let lastKey = 0;

/**
 * A key for each queued track that follows it when it moves. The same track
 * can be queued twice, so a second copy gets its place among the copies added.
 */
function keysFor(queue: WebTrack[]) {
  const seen = new Map<number, number>();
  return queue.map((item) => {
    let key = keys.get(item);
    if (key === undefined) keys.set(item, (key = ++lastKey));
    const copy = seen.get(key) ?? 0;
    seen.set(key, copy + 1);
    return `${key}:${copy}`;
  });
}

/**
 * The queue's rows. Drag one to move it, or hold Alt and press an arrow on
 * it. On its own and memoised, because the sheet around it is drawn again
 * every time the clock ticks, and a long queue shouldn't be.
 */
const QueueList = memo(function QueueList() {
  const queue = usePlayer((state) => state.queue);
  const index = usePlayer((state) => state.index);
  const playing = usePlayer((state) => state.playing);
  const { jump, remove, move } = usePlayer.getState();
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  // The queue opens on the track that is playing, with what comes next below it, and follows it from one track to the
  // next. A ref, not an effect: the sheet's rows don't exist yet when it is told to open.
  const showCurrent = useCallback((row: HTMLLIElement | null) => row?.scrollIntoView({ block: "start" }), []);

  if (!queue.length) return <p className="text-muted-foreground p-4 text-sm">The queue is empty. Line something up.</p>;
  const rowKeys = keysFor(queue);
  return (
    <ol className="no-scrollbar flex-1 overflow-y-auto p-2">
      {queue.map((item, i) => (
        <li
          key={rowKeys[i]}
          ref={i === index ? showCurrent : undefined}
          aria-current={i === index ? "true" : undefined}
          draggable
          onDragStart={(event) => {
            setDragging(i);
            event.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setOver(i);
          }}
          onDragEnd={() => {
            setDragging(null);
            setOver(null);
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (dragging !== null) move(dragging, i);
            setDragging(null);
            setOver(null);
          }}
          className={cn(
            "group hover:bg-accent/50 has-focus-visible:bg-accent/50 flex scroll-mt-1 items-center gap-1.5 rounded-md pr-1 pl-1 transition-colors",
            dragging === i && "opacity-40",
            // A line on the edge the row will land against.
            over === i && dragging !== null && dragging !== i && (dragging < i ? "shadow-[inset_0_-2px_0_var(--brand)]" : "shadow-[inset_0_2px_0_var(--brand)]"),
          )}
        >
          <GripVertical aria-hidden className="text-muted-foreground size-3.5 shrink-0 cursor-grab opacity-0 group-hover:opacity-100 pointer-coarse:hidden" />
          <span className="lamp" data-lit={i === index && playing} />
          <button
            type="button"
            aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
            className="min-w-0 flex-1 px-1 py-1.5 text-left outline-none"
            onClick={() => jump(i)}
            onKeyDown={(event) => {
              if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
              event.preventDefault();
              move(i, event.key === "ArrowUp" ? i - 1 : i + 1);
            }}
          >
            <p className={cn("truncate text-sm group-has-focus-visible:underline", i === index && "text-brand-text")}>{item.title}</p>
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
  );
});
