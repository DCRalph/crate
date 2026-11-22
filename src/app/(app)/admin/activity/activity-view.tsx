"use client";

import { useState } from "react";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { z } from "zod";

import { LocalTime } from "~/components/local-time";
import { Page } from "~/components/shell/page";
import { Empty, LoadError } from "~/components/shell/states";
import { Status } from "~/components/shell/status";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import { Switch } from "~/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { activityActions, type ActivityAction } from "~/lib/activity-actions";
import { scanSummary } from "~/lib/format";
import { useTRPC } from "~/trpc/react";

const head = "t-label text-muted-foreground text-[10px]";
const options = { getNextPageParam: (last: { nextCursor: number | null }) => last.nextCursor, placeholderData: keepPreviousData };

type Kind = "all" | "sign-ins" | "changes";

/** The three logs: what people changed and who signed in, every request, and every play. */
export function ActivityView() {
  const [tab, setTab] = useState("activity");
  // One filter box across the tabs: looking for a person usually means looking in all three.
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [failedOnly, setFailedOnly] = useState(false);

  return (
    <Page>
      <Tabs value={tab} onValueChange={setTab}>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <TabsList>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="requests">Requests</TabsTrigger>
            <TabsTrigger value="plays">Plays</TabsTrigger>
          </TabsList>
          <Input
            type="search"
            aria-label="Filter the log"
            placeholder="Filter by user, app, address"
            className="h-8 w-64 max-sm:w-full"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {tab === "activity" ? (
            <Select value={kind} onValueChange={(value) => setKind(value as Kind)}>
              <SelectTrigger size="sm" aria-label="Kind of event" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everything</SelectItem>
                <SelectItem value="sign-ins">Sign-ins</SelectItem>
                <SelectItem value="changes">Changes</SelectItem>
              </SelectContent>
            </Select>
          ) : null}
          {tab === "requests" ? (
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={failedOnly} onCheckedChange={setFailedOnly} />
              Failed only
            </label>
          ) : null}
        </div>
        <TabsContent value="activity">
          <ActivityLog search={search} kind={kind} />
        </TabsContent>
        <TabsContent value="requests">
          <RequestLog search={search} failedOnly={failedOnly} />
        </TabsContent>
        <TabsContent value="plays">
          <PlayLog search={search} />
        </TabsContent>
      </Tabs>
    </Page>
  );
}

/** The frame every log shares: loading, error and empty states, the table, and "Show more". */
function LogTable<Row extends { id: number }>({
  query,
  columns,
  row,
}: {
  query: {
    data?: { pages: { items: Row[] }[] };
    isPending: boolean;
    error: { message: string } | null;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => unknown;
  };
  /** Column headings. Ones ending in a number column pass `right` to line up with their cells. */
  columns: (string | { label: string; right: true })[];
  row: (item: Row) => React.ReactNode;
}) {
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <>
      {query.isPending ? (
        <Skeleton className="h-64" />
      ) : query.error ? (
        <LoadError message={query.error.message} />
      ) : items.length === 0 ? (
        <Empty>Nothing here.</Empty>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {columns.map((column) =>
                  typeof column === "string" ? (
                    <TableHead key={column} className={head}>
                      {column}
                    </TableHead>
                  ) : (
                    <TableHead key={column.label} className={`${head} text-right`}>
                      {column.label}
                    </TableHead>
                  ),
                )}
              </TableRow>
            </TableHeader>
            <TableBody>{items.map(row)}</TableBody>
          </Table>
          {query.hasNextPage ? (
            <div className="mt-6 flex justify-center">
              <Button variant="outline" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
                Show more
              </Button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}

const When = ({ at }: { at: Date }) => (
  <TableCell className="text-muted-foreground tabular-nums">
    <LocalTime date={at} />
  </TableCell>
);
const Address = ({ ip }: { ip: string | null }) => <TableCell className="text-muted-foreground font-mono text-xs">{ip ?? ""}</TableCell>;

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

function ActivityLog({ search, kind }: { search: string; kind: Kind }) {
  const trpc = useTRPC();
  const query = useInfiniteQuery(trpc.admin.logs.activity.infiniteQueryOptions({ search: search || undefined, kind }, options));
  return (
    <LogTable
      query={query}
      columns={["When", "Who", "Event", "Target", "Detail", "Address"]}
      row={(item) => {
        const action = activityActions[item.action as ActivityAction] ?? { label: item.action, tone: "neutral" as const };
        return (
          <TableRow key={item.id}>
            <When at={item.at} />
            <TableCell>{item.actorName ?? ""}</TableCell>
            <TableCell>
              <Status tone={action.tone} label={action.label} />
            </TableCell>
            <TableCell>{item.target ?? ""}</TableCell>
            <TableCell className="text-muted-foreground max-w-72 truncate text-xs">{describeDetail(item.action, item.detail)}</TableCell>
            <Address ip={item.ip} />
          </TableRow>
        );
      }}
    />
  );
}

function RequestLog({ search, failedOnly }: { search: string; failedOnly: boolean }) {
  const trpc = useTRPC();
  const query = useInfiniteQuery(trpc.admin.logs.requests.infiniteQueryOptions({ search: search || undefined, failedOnly }, options));
  return (
    <LogTable
      query={query}
      columns={["When", "User", "Request", "Result", "App", "Address", { label: "Time", right: true }]}
      row={(item) => (
        <TableRow key={item.id}>
          <When at={item.at} />
          <TableCell>{item.username ?? ""}</TableCell>
          <TableCell>
            <span className="font-mono text-xs">{item.endpoint}</span>
            {item.trackTitle ? <span className="text-muted-foreground"> · {item.trackTitle}</span> : null}
          </TableCell>
          <TableCell>{item.ok ? <Status tone="ok" label="OK" /> : <Status tone="bad" label="Failed" reason={item.error} />}</TableCell>
          <TableCell className="text-muted-foreground">{item.client ?? ""}</TableCell>
          <Address ip={item.ip} />
          <TableCell className="text-muted-foreground text-right tabular-nums">{item.durationMs} ms</TableCell>
        </TableRow>
      )}
    />
  );
}

function PlayLog({ search }: { search: string }) {
  const trpc = useTRPC();
  const query = useInfiniteQuery(trpc.admin.logs.plays.infiniteQueryOptions({ search: search || undefined }, options));
  return (
    <LogTable
      query={query}
      columns={["When", "User", "Track", "App", "Address"]}
      row={(item) => (
        <TableRow key={item.id}>
          <When at={item.at} />
          <TableCell>{item.username}</TableCell>
          <TableCell>
            {item.title}
            <span className="text-muted-foreground"> · {item.artistName}</span>
          </TableCell>
          <TableCell className="text-muted-foreground">{item.client ?? ""}</TableCell>
          <Address ip={item.ip} />
        </TableRow>
      )}
    />
  );
}
