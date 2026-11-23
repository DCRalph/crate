"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { DataTable, useDataTable, useTableWidth, type DataTableApi, type DataTableColumn, type ListResult } from "~/components/data-table";
import { LocalTime } from "~/components/local-time";
import { Page } from "~/components/shell/page";
import { LoadError } from "~/components/shell/states";
import { Status, type Tone } from "~/components/shell/status";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { activityActions } from "~/lib/activity-actions";
import { scanSummary } from "~/lib/format";
import { useTRPC, type RouterOutputs } from "~/trpc/react";

const tabs = ["activity", "requests", "plays"] as const;

/** The three logs: what people changed and who signed in, every request, and every play. */
export function ActivityView() {
  // The open tab lives in the URL beside each table's own state, so a link or a refresh lands on the same view.
  const params = useSearchParams();
  const tab = tabs.find((name) => name === params.get("tab")) ?? tabs[0];
  /**
   * Written with the history API, as the tables write theirs, so nothing is
   * fetched. Passing no state is what makes Next take in the address as it now
   * stands, the tables' part included, and a table coming back into view
   * starts from that.
   */
  const open = (next: string) => {
    const query = new URLSearchParams(window.location.search);
    if (next === tabs[0]) query.delete("tab");
    else query.set("tab", next);
    const search = query.toString();
    window.history.replaceState(null, "", search ? `${window.location.pathname}?${search}` : window.location.pathname);
  };

  return (
    <Page>
      <Tabs value={tab} onValueChange={open} className="gap-4">
        <TabsList>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="requests">Requests</TabsTrigger>
          <TabsTrigger value="plays">Plays</TabsTrigger>
        </TabsList>
        <TabsContent value="activity">
          <ActivityLog />
        </TabsContent>
        <TabsContent value="requests">
          <RequestLog />
        </TabsContent>
        <TabsContent value="plays">
          <PlayLog />
        </TabsContent>
      </Tabs>
    </Page>
  );
}

const getRowId = (row: { id: number }) => String(row.id);
const pageSize = 50;
const muted = "text-muted-foreground";

/** The frame every log shares: the table, or the reason it couldn't be read. */
function LogTable<Row>({
  table,
  columns,
  list,
  searchPlaceholder,
}: {
  table: DataTableApi<Row>;
  columns: DataTableColumn<Row>[];
  list: { data?: ListResult<Row>; isPending: boolean; isFetching: boolean; error: { message: string } | null };
  searchPlaceholder: string;
}) {
  if (list.error) return <LoadError error={list.error} />;
  return (
    <DataTable
      api={table}
      columns={columns}
      data={list.data?.rows ?? []}
      total={list.data?.total ?? 0}
      isLoading={list.isPending}
      isFetching={list.isFetching}
      searchPlaceholder={searchPlaceholder}
      emptyMessage="Nothing here."
    />
  );
}

const When = ({ at }: { at: Date }) => <LocalTime date={at} className={`${muted} tabular-nums`} />;
const Address = ({ ip }: { ip: string | null }) => <span className={`${muted} font-mono text-xs`}>{ip ?? ""}</span>;

// In each table the column ids are the server's: the log procedures sort and
// filter on these names. Widths are the table's own, in px.

type ActivityRow = RouterOutputs["admin"]["logs"]["activity"]["rows"][number];

/** The table width from which a target has a column of its own. Below it, the event carries it. */
const targetFrom = 640;

/** How an action reads in the table. One the app no longer knows is shown under its own name. */
const knownActions: Record<string, { label: string; tone: Tone }> = activityActions;
const actionOf = (action: string) => knownActions[action] ?? { label: action, tone: "neutral" };

const scanResult = z.object({
  added: z.number(),
  updated: z.number(),
  removed: z.number(),
  failed: z.number(),
  durationMs: z.number(),
  error: z.string().optional(),
});

/** A detail object as "key value · key value", for the log's Detail column. Scans read as they do on the Libraries page. */
function describeDetail(action: string, detail: Record<string, unknown> | null) {
  if (!detail) return "";
  if (action === "library.scanned") {
    const scan = scanResult.safeParse(detail);
    if (scan.success) return scan.data.error ?? scanSummary(scan.data);
  }
  return Object.entries(detail)
    .filter(([, value]) => value !== null && value !== undefined && typeof value !== "object")
    .map(([key, value]) => `${key} ${typeof value === "boolean" ? (value ? "on" : "off") : String(value)}`)
    .join(" · ");
}

/** What happened, and on a narrow table what it happened to. */
function EventCell({ row }: { row: ActivityRow }) {
  const width = useTableWidth();
  const action = actionOf(row.action);
  return <Status tone={action.tone} label={action.label} reason={width !== null && width < targetFrom ? row.target : null} />;
}

const activityColumns: DataTableColumn<ActivityRow>[] = [
  { id: "at", header: "When", type: "date", sortable: true, filterable: true, hideable: false, cell: (row) => <When at={row.at} /> },
  { id: "actorName", header: "Who", filterable: true, cell: (row) => row.actorName ?? "" },
  {
    id: "action",
    header: "Event",
    type: "badge",
    filterable: true,
    options: Object.entries(activityActions).map(([value, action]) => ({ value, label: action.label })),
    cell: (row) => <EventCell row={row} />,
  },
  {
    id: "kind",
    header: "Kind",
    type: "badge",
    filterable: true,
    defaultHidden: true,
    options: [
      { label: "Sign-ins", value: "sign-ins" },
      { label: "Changes", value: "changes" },
    ],
    cell: (row) => <span className={muted}>{row.kind === "sign-ins" ? "Sign-in" : "Change"}</span>,
  },
  { id: "target", header: "Target", showFrom: targetFrom, cell: (row) => row.target ?? "" },
  {
    id: "detail",
    header: "Detail",
    showFrom: 900,
    cell: (row) => <span className={`${muted} block max-w-72 truncate text-xs`}>{describeDetail(row.action, row.detail)}</span>,
  },
  { id: "ip", header: "Address", showFrom: 1000, cell: (row) => <Address ip={row.ip} /> },
];

function ActivityLog() {
  const trpc = useTRPC();
  const table = useDataTable({ columns: activityColumns, getRowId, urlKey: "activity", pageSize });
  const list = useQuery(trpc.admin.logs.activity.queryOptions(table.queryInput, { placeholderData: (previous) => previous }));
  return <LogTable table={table} columns={activityColumns} list={list} searchPlaceholder="Who, target or address" />;
}

type RequestRow = RouterOutputs["admin"]["logs"]["requests"]["rows"][number];

const requestColumns: DataTableColumn<RequestRow>[] = [
  { id: "at", header: "When", type: "date", sortable: true, filterable: true, hideable: false, cell: (row) => <When at={row.at} /> },
  { id: "username", header: "User", filterable: true, cell: (row) => row.username ?? "" },
  {
    id: "api",
    header: "API",
    type: "badge",
    filterable: true,
    showFrom: 900,
    options: [
      { label: "Subsonic", value: "subsonic" },
      { label: "Web", value: "web" },
    ],
    cell: (row) => <span className={muted}>{row.api === "subsonic" ? "Subsonic" : "Web"}</span>,
  },
  {
    id: "endpoint",
    header: "Request",
    filterable: true,
    cell: (row) => (
      <>
        <span className="font-mono text-xs">{row.endpoint}</span>
        {row.trackTitle ? <span className={muted}> · {row.trackTitle}</span> : null}
      </>
    ),
  },
  {
    id: "result",
    header: "Result",
    type: "badge",
    filterable: true,
    options: [
      { label: "OK", value: "ok", dotClassName: "bg-ok" },
      { label: "Failed", value: "failed", dotClassName: "bg-destructive" },
    ],
    cell: (row) => (row.ok ? <Status tone="ok" label="OK" /> : <Status tone="bad" label="Failed" reason={row.error} />),
  },
  { id: "client", header: "App", filterable: true, showFrom: 640, cell: (row) => <span className={muted}>{row.client ?? ""}</span> },
  { id: "ip", header: "Address", filterable: true, showFrom: 760, cell: (row) => <Address ip={row.ip} /> },
  {
    id: "durationMs",
    header: "Time",
    type: "number",
    align: "right",
    showFrom: 520,
    cell: (row) => <span className={`${muted} tabular-nums`}>{row.durationMs} ms</span>,
  },
];

function RequestLog() {
  const trpc = useTRPC();
  const table = useDataTable({ columns: requestColumns, getRowId, urlKey: "requests", pageSize });
  const list = useQuery(trpc.admin.logs.requests.queryOptions(table.queryInput, { placeholderData: (previous) => previous }));
  return <LogTable table={table} columns={requestColumns} list={list} searchPlaceholder="User, request, app or address" />;
}

type PlayRow = RouterOutputs["admin"]["logs"]["plays"]["rows"][number];

/** The table width from which the artist has a column of their own. Below it, the track carries the name. */
const artistFrom = 640;

/** The track, and on a narrow table who it is by. */
function TrackCell({ row }: { row: PlayRow }) {
  const width = useTableWidth();
  return (
    <>
      {row.title}
      {width !== null && width < artistFrom ? <span className={muted}> · {row.artistName}</span> : null}
    </>
  );
}

const playColumns: DataTableColumn<PlayRow>[] = [
  { id: "at", header: "When", type: "date", sortable: true, filterable: true, hideable: false, cell: (row) => <When at={row.at} /> },
  { id: "username", header: "User", filterable: true },
  { id: "title", header: "Track", filterable: true, cell: (row) => <TrackCell row={row} /> },
  { id: "artistName", header: "Artist", filterable: true, showFrom: artistFrom, cell: (row) => <span className={muted}>{row.artistName}</span> },
  { id: "client", header: "App", filterable: true, showFrom: 520, cell: (row) => <span className={muted}>{row.client ?? ""}</span> },
  { id: "ip", header: "Address", showFrom: 760, cell: (row) => <Address ip={row.ip} /> },
];

function PlayLog() {
  const trpc = useTRPC();
  const table = useDataTable({ columns: playColumns, getRowId, urlKey: "plays", pageSize });
  const list = useQuery(trpc.admin.logs.plays.queryOptions(table.queryInput, { placeholderData: (previous) => previous }));
  return <LogTable table={table} columns={playColumns} list={list} searchPlaceholder="User, track, artist or app" />;
}
