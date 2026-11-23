"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ListEnd, ListPlus, ListStart, Pause, Play } from "lucide-react";
import { toast } from "sonner";

import { DataTable, useDataTable, useTableWidth, type BulkAction, type DataTableColumn } from "~/components/data-table";
import { Cover } from "~/components/library/cover";
import { LikeButton } from "~/components/library/like-button";
import { RowWave } from "~/components/library/row-wave";
import { useTrackRows } from "~/components/library/track-rows";
import { usePendingTracks } from "~/components/library/pending-tracks";
import { contextKit, TrackActions } from "~/components/library/track-actions";
import { TrackInfoDialog } from "~/components/library/track-info";
import { TrackMenu } from "~/components/library/track-table";
import { LocalTime } from "~/components/local-time";
import { rowNumber, useNumbered } from "~/components/player/selection";
import { useCurrentTrack, usePlayer } from "~/components/player/store";
import { Page } from "~/components/shell/page";
import { LoadError } from "~/components/shell/states";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "~/components/ui/context-menu";
import { count, formatDuration } from "~/lib/format";
import { cn } from "~/lib/utils";
import type { WebTrack } from "~/server/api/routers/library";
import { audioTypes } from "~/server/library/audio";
import { useTRPC, type RouterOutputs } from "~/trpc/react";

type Track = RouterOutputs["library"]["tracks"]["rows"][number];
/** A track with its place on the page, which is the number printed on its row. */
type Row = Track & { index: number };

const formats = Object.keys(audioTypes).map((suffix) => ({ label: suffix.toUpperCase(), value: suffix }));

/** Cover and title. On a table too narrow for the Artist column, the artist goes under the title so it is never lost. */
function TitleCell({ row }: { row: Row }) {
  const width = useTableWidth();
  return (
    <span className="flex min-w-0 items-center gap-3">
      <Cover type="album" id={row.albumId} size={64} className="size-8" />
      <span className="min-w-0">
        <span className="block truncate font-medium">{row.title}</span>
        {width !== null && width < 560 ? <span className="text-muted-foreground block truncate text-xs">{row.artistName}</span> : null}
      </span>
    </span>
  );
}

/** A row's number and lamp. Clicking plays the page from that row; on the row that is playing it pauses. */
function PlayCell({ row, onPlay }: { row: Row; onPlay: (index: number) => void }) {
  const isCurrent = useCurrentTrack()?.id === row.id;
  const playing = usePlayer((state) => state.playing);
  return (
    <button
      type="button"
      aria-label={isCurrent && playing ? `Pause ${row.title}` : `Play ${row.title}`}
      onClick={() => (isCurrent ? usePlayer.getState().setPlaying(!playing) : onPlay(row.index))}
      className="group/play focus-visible:ring-ring/60 inline-flex h-6 items-center gap-2 rounded-sm outline-none focus-visible:ring-[3px]"
    >
      {/* Keyed, so the lamp pops once as it lights. */}
      <span key={String(isCurrent)} className={cn("lamp", isCurrent && "animate-pop")} data-lit={isCurrent} aria-hidden />
      <span className={cn("t-num w-6 text-left text-[15px] group-hover/play:hidden", isCurrent ? "text-foreground" : "text-muted-foreground")}>
        {rowNumber(row.index)}
      </span>
      <span className="hidden w-6 group-hover/play:block">
        {isCurrent && playing ? <Pause className="size-3.5 fill-current" /> : <Play className="size-3.5 fill-current" />}
      </span>
    </button>
  );
}

/**
 * Every track in the library as one table: search it, sort it by any column,
 * filter it by format, year or when it was added. Rows are numbered on the
 * page; a row's number, a double click, or typing the number and Enter plays
 * the page from there. Rows can be ticked and queued or made into a playlist
 * together, and a right-click on a row brings up its menu, for every ticked
 * row when it is one of them.
 */
export function TracksView() {
  const trpc = useTRPC();
  const [info, setInfo] = useState<{ track: WebTrack; open: boolean } | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  /** The tracks a right-click was for. Kept after the menu closes, so it doesn't empty as it fades. */
  const [menuFor, setMenuFor] = useState<Row[]>([]);
  const router = useRouter();
  const play = (index: number) => usePlayer.getState().play(rows, index);
  // Each row's small waveform and how often this person has played it, for the page in one go.
  const extras = useTrackRows(useMemo(() => rows.map((row) => row.id), [rows]));

  const columns = useMemo<DataTableColumn<Row>[]>(
    () => [
      { id: "play", header: "No.", hideable: false, className: "w-16 pl-4", headerClassName: "pl-4", cell: (row) => <PlayCell row={row} onPlay={(index) => usePlayer.getState().play(rows, index)} /> },
      {
        id: "title",
        header: "Title",
        sortable: true,
        hideable: false,
        className: "max-w-0 w-2/5 py-1.5",
        cell: (row) => <TitleCell row={row} />,
      },
      {
        id: "artistName",
        header: "Artist",
        sortable: true,
        filterable: true,
        showFrom: 560,
        className: "max-w-0 w-1/4 truncate",
        cell: (row) => (
          <Link href={`/artists/${row.artistId}`} className="text-muted-foreground hover:text-foreground hover:underline" onClick={(event) => event.stopPropagation()}>
            {row.artistName}
          </Link>
        ),
      },
      {
        id: "albumName",
        header: "Album",
        sortable: true,
        filterable: true,
        showFrom: 900,
        className: "max-w-0 w-1/5 truncate",
        cell: (row) => (
          <Link href={`/albums/${row.albumId}`} className="text-muted-foreground hover:text-foreground hover:underline" onClick={(event) => event.stopPropagation()}>
            {row.albumName}
          </Link>
        ),
      },
      { id: "genre", header: "Genre", sortable: true, filterable: true, showFrom: 1180, cell: (row) => <span className="text-muted-foreground">{row.genre ?? ""}</span> },
      { id: "year", header: "Year", type: "number", sortable: true, filterable: true, showFrom: 1060, cell: (row) => <span className="text-muted-foreground tabular-nums">{row.year ?? ""}</span> },
      { id: "suffix", header: "Format", type: "badge", sortable: true, filterable: true, options: formats, showFrom: 760, badge: (value) => ({ label: String(value).toUpperCase() }) },
      { id: "bitRate", header: "kbps", type: "number", align: "right", sortable: true, filterable: true, defaultHidden: true, showFrom: 760 },
      {
        id: "createdAt",
        header: "Added",
        type: "date",
        sortable: true,
        filterable: true,
        defaultHidden: true,
        showFrom: 760,
        cell: (row) => (
          <span className="text-muted-foreground">
            <LocalTime date={row.createdAt} format="relative" />
          </span>
        ),
      },
      {
        id: "waveform",
        header: "Waveform",
        showFrom: 1180,
        className: "w-32 py-0",
        cell: (row) => {
          const peaks = extras[row.id]?.peaks;
          return peaks ? <span className="text-muted-foreground/70 block"><RowWave peaks={peaks} /></span> : null;
        },
      },
      {
        id: "plays",
        header: "Plays",
        align: "right",
        showFrom: 640,
        cell: (row) => <span className="t-num text-muted-foreground text-[15px]">{extras[row.id]?.plays || null}</span>,
      },
      // Left off the narrowest screens, where the title needs the room more.
      { id: "duration", header: "Time", align: "right", sortable: true, showFrom: 430, cell: (row) => <span className="text-muted-foreground tabular-nums">{formatDuration(row.duration)}</span> },
      {
        id: "actions",
        header: "",
        hideable: false,
        className: "w-20 py-0",
        // The menu button normally waits for its row to be hovered; in this table it is always there.
        cell: (row) => (
          <span className="flex items-center justify-end [&_button]:opacity-100">
            <LikeButton track={row} />
            <TrackMenu track={row} onInfo={() => setInfo({ track: row, open: true })} />
          </span>
        ),
      },
    ],
    [rows, extras],
  );

  const table = useDataTable({ columns, getRowId: (row) => String(row.id), urlKey: "tracks", pageSize: 50, defaultSort: [{ id: "title", desc: false }] });
  const tracks = useQuery(trpc.library.tracks.queryOptions(table.queryInput, { placeholderData: (previous) => previous }));

  // The rows with their numbers. Kept in state so the cells above can start the page playing from any of them.
  const data = tracks.data?.rows;
  const [seen, setSeen] = useState(data);
  if (data !== seen) {
    setSeen(data);
    setRows((data ?? []).map((track, index) => ({ ...track, index })));
  }
  useNumbered(rows.length, play);

  const said = (chosen: Row[]) => (chosen.length === 1 ? chosen[0]!.title : count(chosen.length, "track"));
  const bulkActions: BulkAction<Row>[] = [
    {
      label: "Play next",
      icon: ListStart,
      onClick: (chosen) => {
        usePlayer.getState().playNext(chosen);
        toast(`Playing next: ${said(chosen)}`);
      },
    },
    {
      label: "Add to queue",
      icon: ListEnd,
      onClick: (chosen) => {
        usePlayer.getState().enqueue(chosen);
        toast(`Added to queue: ${said(chosen)}`);
      },
    },
    {
      // The tracks wait while the person names the playlist on its own page. An existing playlist is in the right-click menu.
      label: "New playlist",
      icon: ListPlus,
      onClick: (chosen) => {
        usePendingTracks.getState().set(
          chosen.map((track) => track.id),
          said(chosen),
        );
        router.push("/playlists/new");
      },
    },
  ];

  return (
    <Page detail={tracks.data ? count(tracks.data.total, "track") : null}>
      {tracks.isError ? (
        <LoadError error={tracks.error} />
      ) : (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              onContextMenu={(event) => {
                const id = event.target instanceof Element ? event.target.closest<HTMLElement>("tr[data-row-id]")?.dataset.rowId : undefined;
                const row = rows.find((item) => String(item.id) === id);
                if (!row) return event.preventDefault();
                const ticked = table.getSelectedRows(rows);
                setMenuFor(ticked.includes(row) ? ticked : [row]);
              }}
            >
              <DataTable
                api={table}
                columns={columns}
                data={rows}
                total={tracks.data?.total ?? 0}
                isLoading={tracks.isPending}
                isFetching={tracks.isFetching}
                searchPlaceholder="Title, artist or album"
                onRowDoubleClick={(row) => play(row.index)}
                bulkActions={bulkActions}
                emptyMessage="No tracks match."
              />
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-52">
            <TrackActions kit={contextKit} tracks={menuFor} onInfo={(track) => setInfo({ track, open: true })} />
          </ContextMenuContent>
        </ContextMenu>
      )}
      {info ? <TrackInfoDialog track={info.track} open={info.open} onOpenChange={(open) => setInfo({ ...info, open })} /> : null}
    </Page>
  );
}
