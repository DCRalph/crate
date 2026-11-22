"use client";

import { useState } from "react";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";

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
import { useTRPC } from "~/trpc/react";

const head = "t-label text-muted-foreground text-[10px]";
const options = { getNextPageParam: (last: { nextCursor: number | null }) => last.nextCursor, placeholderData: keepPreviousData };

/** The three logs: what people changed and who signed in, every request, and every play. */
export function ActivityView() {
  // One search box across the tabs: looking for a person usually means looking in all three.
  const [search, setSearch] = useState("");
  return (
    <Page>
      <Tabs defaultValue="activity">
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
        </div>
        <TabsContent value="activity">
          <ActivityLog search={search} />
        </TabsContent>
        <TabsContent value="requests">
          <RequestLog search={search} />
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
  toolbar,
}: {
  query: {
    data?: { pages: { items: Row[] }[] };
    isPending: boolean;
    error: { message: string } | null;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => unknown;
  };
  columns: string[];
  row: (item: Row) => React.ReactNode;
  toolbar?: React.ReactNode;
}) {
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <>
      {toolbar ? <div className="mb-2 flex items-center gap-3">{toolbar}</div> : null}
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
                {columns.map((column) => (
                  <TableHead key={column} className={head}>
                    {column}
                  </TableHead>
                ))}
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

/** A detail object as "key value · key value", for the log's Detail column. */
function describeDetail(detail: Record<string, unknown> | null) {
  if (!detail) return "";
  return Object.entries(detail)
    .filter(([, value]) => value !== null && value !== undefined && typeof value !== "object")
    .map(([key, value]) => `${key} ${typeof value === "boolean" ? (value ? "on" : "off") : String(value)}`)
    .join(" · ");
}

function ActivityLog({ search }: { search: string }) {
  const trpc = useTRPC();
  const [kind, setKind] = useState<"all" | "sign-ins" | "changes">("all");
  const query = useInfiniteQuery(trpc.admin.logs.activity.infiniteQueryOptions({ search: search || undefined, kind }, options));
  return (
    <LogTable
      query={query}
      columns={["When", "Who", "Event", "Target", "Detail", "Address"]}
      toolbar={
        <Select value={kind} onValueChange={(value) => setKind(value as typeof kind)}>
          <SelectTrigger size="sm" aria-label="Kind of event" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everything</SelectItem>
            <SelectItem value="sign-ins">Sign-ins</SelectItem>
            <SelectItem value="changes">Changes</SelectItem>
          </SelectContent>
        </Select>
      }
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
            <TableCell className="text-muted-foreground max-w-72 truncate text-xs">{describeDetail(item.detail)}</TableCell>
            <Address ip={item.ip} />
          </TableRow>
        );
      }}
    />
  );
}

function RequestLog({ search }: { search: string }) {
  const trpc = useTRPC();
  const [failedOnly, setFailedOnly] = useState(false);
  const query = useInfiniteQuery(trpc.admin.logs.requests.infiniteQueryOptions({ search: search || undefined, failedOnly }, options));
  return (
    <LogTable
      query={query}
      columns={["When", "User", "Request", "Result", "App", "Address", "Time"]}
      toolbar={
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={failedOnly} onCheckedChange={setFailedOnly} />
          Failed only
        </label>
      }
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
