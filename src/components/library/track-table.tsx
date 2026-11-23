"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MoreHorizontal, Pause, Play } from "lucide-react";

import { startTrackAt } from "~/components/player/playhead";
import { rowNumber, useNumbered } from "~/components/player/selection";
import { useCurrentTrack, usePlayer } from "~/components/player/store";
import { RowsSkeleton } from "~/components/shell/skeletons";
import { Button } from "~/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "~/components/ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { formatDuration } from "~/lib/format";
import { cn } from "~/lib/utils";
import type { WebTrack } from "~/server/api/routers/library";
import { BulkBar } from "./bulk-bar";
import { Cover } from "./cover";
import { LikeButton } from "./like-button";
import { RowWave } from "./row-wave";
import { useTrackRows } from "./track-rows";
import { contextKit, dropdownKit, TrackActions } from "./track-actions";
import { TrackInfoDialog } from "./track-info";

// Which columns a list has room for, by its own width (a container query), the title always first. The waveform
// comes next, from a tablet's width up, so it can be tapped. The artist column after it; below that the artist
// rides under the title instead. Then how often it was played, and the album last of all. A list that is about
// its plays (Most played) always shows them: the counts are the point of it.
const waveColumn = "@max-lg:hidden";
const artistColumn = "@max-3xl:hidden";
const playsColumn = "@max-4xl:hidden";
const albumColumn = "@max-5xl:hidden";

/** The rows from `from` to `to`, whichever way round they were clicked. */
const between = (from: number, to: number) => Array.from({ length: Math.abs(to - from) + 1 }, (_, i) => Math.min(from, to) + i);

/**
 * The list of tracks on an album, playlist or search page, printed as a card.
 * Every row has a number and a lamp. Clicking the number plays from there, as
 * does double-clicking the row or typing the number and Enter. The lamp is
 * lit on the row that is playing, and that row's button pauses.
 *
 * A click chooses a row; Shift and Ctrl or Cmd choose more. A right-click
 * brings up the same actions as the row's menu, for everything chosen, and
 * with two or more chosen a strip of them comes up over the deck. Escape, or
 * a click elsewhere, lets go of the choice.
 *  - `showCover`: puts each track's album cover beside its title, for lists
 *    that mix albums. Off on an album's own page, where they'd all be the same.
 *  - `onRemove`: adds "Remove from playlist".
 *  - `from`: names the list for the queue ("album:12"), so its Play key knows it is what is playing.
 *  - `plays`: what the Plays column shows for each track, for a list that
 *    counts its own way (Most played's range). Otherwise it is how often
 *    this person has played the track, all time.
 *
 * Beside each track is its small waveform (on a wide screen) and how often
 * you have played it, fetched for the whole list in one go.
 */
export function TrackTable<T extends WebTrack>({
  tracks,
  showAlbum = false,
  showCover = false,
  onRemove,
  from,
  plays,
}: {
  tracks: T[];
  showAlbum?: boolean;
  showCover?: boolean;
  onRemove?: (index: number) => void;
  from?: string;
  plays?: (track: T) => number;
}) {
  // One Get info dialog for the whole list. The track stays after closing, so the dialog doesn't empty as it fades.
  const [info, setInfo] = useState<{ track: WebTrack; open: boolean } | null>(null);
  /** The rows chosen, by position, and the one a Shift-click measures from. */
  const [chosen, setChosen] = useState<{ rows: ReadonlySet<number>; anchor: number }>({ rows: new Set(), anchor: 0 });
  const current = useCurrentTrack();
  const playing = usePlayer((state) => state.playing);
  const { play, setPlaying } = usePlayer.getState();
  const playFrom = (index: number) => play(tracks, index, from);
  useNumbered(tracks.length, playFrom);
  const extras = useTrackRows(useMemo(() => tracks.map((track) => track.id), [tracks]));

  const clear = () => setChosen({ rows: new Set(), anchor: 0 });
  const any = chosen.rows.size > 0;
  // Escape, or a click on anything that isn't the list or something acting on it, lets go of the choice.
  useEffect(() => {
    if (!any) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && clear();
    const onPointer = (event: PointerEvent) => {
      if (!(event.target instanceof Element && event.target.closest("[data-selection], #player-bar, [role=menu], [role=dialog], [role=alertdialog]"))) clear();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [any]);

  const choose = (index: number, event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
    if (event.shiftKey) return setChosen({ rows: new Set(between(chosen.anchor, index)), anchor: chosen.anchor });
    if (!event.metaKey && !event.ctrlKey) return setChosen({ rows: new Set([index]), anchor: index });
    const rows = new Set(chosen.rows);
    if (!rows.delete(index)) rows.add(index);
    setChosen({ rows, anchor: index });
  };
  const chosenRows = [...chosen.rows].filter((index) => index < tracks.length).sort((a, b) => a - b);
  const chosenTracks = chosenRows.flatMap((index) => tracks[index] ?? []);
  // From the end, so taking one out doesn't move the ones still to go.
  const removeChosen = onRemove
    ? () => {
        for (const index of chosenRows.toReversed()) onRemove(index);
        clear();
      }
    : undefined;

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            data-selection
            // Columns come and go with the list's own width, not the screen's: the title always has room first.
            className="print @container overflow-hidden rounded-lg shadow-[0_1px_2px_rgb(0_0_0/0.14)]"
            // A right-click on a row that isn't chosen chooses it alone first. One on the heading has nothing to act on.
            onContextMenu={(event) => {
              const row = event.target instanceof Element ? event.target.closest<HTMLElement>("tr[data-index]") : null;
              if (!row) return event.preventDefault();
              const index = Number(row.dataset.index);
              if (!chosen.rows.has(index)) setChosen({ rows: new Set([index]), anchor: index });
            }}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14 pl-3 sm:w-[4.5rem] sm:pl-4">No.</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className={artistColumn}>Artist</TableHead>
                  {showAlbum ? <TableHead className={albumColumn}>Album</TableHead> : null}
                  <TableHead className={cn("w-32", waveColumn)} aria-label="Waveform" />
                  <TableHead className={cn("w-12 text-right sm:w-14", !plays && playsColumn)}>Plays</TableHead>
                  <TableHead className="w-10" />
                  <TableHead className="w-12 text-right sm:w-16">Time</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody className="animate-arrive">
                {tracks.map((track, index) => {
                  const isCurrent = current?.id === track.id;
                  const isChosen = chosen.rows.has(index);
                  // The playing row's button pauses and resumes; any other row starts the list from there.
                  const start = () => (isCurrent ? setPlaying(!playing) : playFrom(index));
                  // A click on the heart, the menu or a link belongs to that, not to the row.
                  const onRow = (event: React.MouseEvent) => !(event.target instanceof Element && event.target.closest("button, a"));
                  return (
                    <TableRow
                      key={`${track.id}-${index}`}
                      data-index={index}
                      data-state={isChosen ? "selected" : undefined}
                      aria-selected={isChosen}
                      className={cn(
                        "group select-none",
                        isCurrent && "bg-muted hover:bg-muted font-semibold",
                        // A coral edge, so a chosen row is told from the playing one, which is also shaded.
                        isChosen && "shadow-[inset_3px_0_0_var(--brand)]",
                      )}
                      onClick={(event) => onRow(event) && choose(index, event)}
                      onDoubleClick={(event) => onRow(event) && playFrom(index)}
                    >
                      <TableCell className="pl-3 sm:pl-4">
                        <button
                          type="button"
                          aria-label={isCurrent && playing ? `Pause ${track.title}` : `Play ${track.title}`}
                          onClick={start}
                          className="focus-visible:ring-ring/60 inline-flex h-6 items-center gap-2 rounded-sm outline-none focus-visible:ring-[3px]"
                        >
                          {/* Keyed, so the lamp pops once as it lights. */}
                          <span key={String(isCurrent)} className={cn("lamp", isCurrent && "animate-pop")} data-lit={isCurrent} aria-hidden />
                          <span className={cn("t-num w-5 text-left text-[15px] group-hover:hidden", isCurrent ? "text-foreground" : "text-muted-foreground")}>
                            {rowNumber(index)}
                          </span>
                          <span className="hidden w-5 group-hover:block">
                            {isCurrent && playing ? <Pause className="size-3.5 fill-current" /> : <Play className="size-3.5 fill-current" />}
                          </span>
                        </button>
                      </TableCell>
                      <TableCell className={cn("w-1/2 max-w-0", showCover && "py-1.5")}>
                        <div className="flex items-center gap-2.5">
                          {showCover ? <Cover type="album" id={track.albumId} size={64} className="size-8" /> : null}
                          <div className="min-w-0">
                            <p className="truncate">{track.title}</p>
                            <p className="text-muted-foreground truncate text-xs font-normal @3xl:hidden">{track.artistName}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className={cn("text-muted-foreground w-1/4 max-w-0 truncate font-normal", artistColumn)}>
                        <Link href={`/artists/${track.artistId}`} className="hover:text-foreground hover:underline">
                          {track.artistName}
                        </Link>
                      </TableCell>
                      {showAlbum ? (
                        <TableCell className={cn("text-muted-foreground w-1/4 max-w-0 truncate font-normal", albumColumn)}>
                          <Link href={`/albums/${track.albumId}`} className="hover:text-foreground hover:underline">
                            {track.albumName}
                          </Link>
                        </TableCell>
                      ) : null}
                      <TableCell className={cn("py-0", waveColumn)}>
                        {extras[track.id]?.peaks ? (
                          <RowWave
                            peaks={extras[track.id]!.peaks!}
                            trackId={track.id}
                            duration={track.duration}
                            title={track.title}
                            onPlayFrom={(seconds) => {
                              startTrackAt(track.id, seconds);
                              playFrom(index);
                            }}
                          />
                        ) : null}
                      </TableCell>
                      <TableCell className={cn("text-muted-foreground t-num text-right text-[15px] font-normal", !plays && playsColumn)}>
                        {(plays ? plays(track) : extras[track.id]?.plays) || null}
                      </TableCell>
                      <TableCell className="py-0">
                        {/* A liked heart always shows; an empty one waits for the row to be hovered or focused. */}
                        <LikeButton
                          track={track}
                          className={cn(!track.starred && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-pressed:opacity-100 pointer-coarse:opacity-100")}
                        />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right font-normal tabular-nums">{formatDuration(track.duration)}</TableCell>
                      <TableCell className="py-0">
                        <TrackMenu track={track} onInfo={() => setInfo({ track, open: true })} onRemove={onRemove ? () => onRemove(index) : undefined} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          <TrackActions kit={contextKit} tracks={chosenTracks} onInfo={(track) => setInfo({ track, open: true })} onRemove={removeChosen} />
        </ContextMenuContent>
      </ContextMenu>
      {chosenTracks.length > 1 ? <BulkBar tracks={chosenTracks} onRemove={removeChosen} onClear={clear} /> : null}
      {info ? <TrackInfoDialog track={info.track} open={info.open} onOpenChange={(open) => setInfo({ ...info, open })} /> : null}
    </>
  );
}

/** The menu behind a row's button: queue it, add it to a playlist, go to its album or artist, download it (when the library allows), and get info on it. */
export function TrackMenu({ track, onInfo, onRemove }: { track: WebTrack; onInfo: () => void; onRemove?: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`More for ${track.title}`}
          className="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <TrackActions kit={dropdownKit} tracks={[track]} onInfo={onInfo} onRemove={onRemove} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Static placeholder rows while a track list loads. */
export function TrackTableSkeleton({ rows = 8, covers = false }: { rows?: number; covers?: boolean }) {
  return <RowsSkeleton rows={rows} covers={covers} />;
}
