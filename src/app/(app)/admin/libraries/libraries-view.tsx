"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { ScanStatus, useScanAnnouncements } from "~/components/admin/scan";
import { DataTable, useDataTable, type DataTableColumn } from "~/components/data-table";
import { Page } from "~/components/shell/page";
import { LoadError } from "~/components/shell/states";
import { Button } from "~/components/ui/button";
import { count } from "~/lib/format";
import { useTRPC, type RouterOutputs } from "~/trpc/react";

type Listing = RouterOutputs["admin"]["libraries"]["list"];
type Row = Listing["libraries"][number] & { running: Listing["scan"] };

const columns: DataTableColumn<Row>[] = [
  {
    id: "name",
    header: "Library",
    hideable: false,
    // The row is clickable for the mouse; this link is the same destination for the keyboard, and for a new tab.
    cell: (row) => (
      <Link href={`/admin/libraries/${row.id}`} className="font-medium outline-none hover:underline focus-visible:underline" onClick={(event) => event.stopPropagation()}>
        {row.name}
      </Link>
    ),
  },
  { id: "path", header: "Folder", showFrom: 860, cell: (row) => <span className="text-muted-foreground font-mono text-xs">{row.path}</span> },
  { id: "albumCount", header: "Albums", type: "number", align: "right", showFrom: 620 },
  { id: "trackCount", header: "Tracks", type: "number", align: "right" },
  { id: "userCount", header: "Users", type: "number", align: "right", showFrom: 700 },
  { id: "ruleCount", header: "Folder rules", type: "number", align: "right", showFrom: 960 },
  { id: "scan", header: "Last scan", hideable: false, cell: (row) => <ScanStatus library={row} running={row.running} /> },
];

/** The folders of media on the server. A row opens the library's own page, where its folder playlists are set up too; a scan's progress shows in its row. */
export function LibrariesView() {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const libraries = useQuery(
    trpc.admin.libraries.list.queryOptions(undefined, {
      // While a scan runs, the row's count is the progress display.
      refetchInterval: (query) => (query.state.data?.scan ? 1000 : false),
    }),
  );
  const refresh = () => queryClient.invalidateQueries(trpc.admin.libraries.pathFilter());
  const scan = useMutation(
    trpc.admin.libraries.scan.mutationOptions({
      // A quick scan can finish before the page ever sees it running, so look again shortly.
      onSuccess: () => {
        void refresh();
        setTimeout(refresh, 1500);
        setTimeout(refresh, 4000);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  useScanAnnouncements(libraries.data?.libraries);

  const rows = useMemo<Row[]>(
    () => (libraries.data?.libraries ?? []).map((library) => ({ ...library, running: libraries.data?.scan ?? null })),
    [libraries.data],
  );
  const table = useDataTable({ columns, getRowId: (row) => String(row.id), storageKey: "libraries" });

  return (
    <Page
      detail={libraries.data ? count(rows.length, "library", "libraries") : null}
      actions={
        <>
          <Button variant="secondary" size="sm" disabled={!!libraries.data?.scan || !rows.length || scan.isPending} onClick={() => scan.mutate({})}>
            <RefreshCw />
            Scan all
          </Button>
          <Button variant="brand" size="sm" asChild>
            <Link href="/admin/libraries/new">
              <Plus />
              Add library
            </Link>
          </Button>
        </>
      }
    >
      {libraries.isError ? (
        <LoadError error={libraries.error} />
      ) : (
        <DataTable
          api={table}
          columns={columns}
          data={rows}
          total={rows.length}
          isLoading={libraries.isPending}
          enableToolbar={false}
          enablePagination={false}
          onRowClick={(row) => router.push(`/admin/libraries/${row.id}`)}
          emptyMessage="No libraries yet. Add a folder of music to get started."
        />
      )}
    </Page>
  );
}
