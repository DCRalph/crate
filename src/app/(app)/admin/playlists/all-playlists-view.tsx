"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { DataTable, useDataTable, type DataTableColumn } from "~/components/data-table";
import { LocalTime } from "~/components/local-time";
import { audienceBadge } from "~/lib/audience";
import { Page } from "~/components/shell/page";
import { LoadError } from "~/components/shell/states";
import { useTRPC, type RouterOutputs } from "~/trpc/react";

type Row = RouterOutputs["admin"]["playlists"]["list"]["rows"][number];

/** The row is clickable for the mouse; this link is the same destination for the keyboard, and for a new tab. */
function NameCell({ row }: { row: Row }) {
  return (
    <Link href={`/playlists/${row.id}`} className="font-medium outline-none hover:underline focus-visible:underline" onClick={(event) => event.stopPropagation()}>
      {row.name}
    </Link>
  );
}

const columns: DataTableColumn<Row>[] = [
  { id: "name", header: "Playlist", sortable: true, hideable: false, cell: (row) => <NameCell row={row} /> },
  { id: "owner", header: "Owner", sortable: true, filterable: true },
  { id: "folder", header: "Folder", showFrom: 760, cell: (row) => <span className="text-muted-foreground">{row.folder ?? "Top level"}</span> },
  { id: "trackCount", header: "Tracks", type: "number", align: "right", sortable: true },
  { id: "audience", header: "Who can listen", showFrom: 620, cell: (row) => <span className="text-muted-foreground">{audienceBadge(row.audience) ?? "Owner only"}</span> },
  { id: "fromDisk", header: "From disk", type: "boolean", filterable: true, showFrom: 620 },
  {
    id: "updatedAt",
    header: "Changed",
    type: "date",
    sortable: true,
    filterable: true,
    showFrom: 880,
    cell: (row) => (
      <span className="text-muted-foreground">
        <LocalTime date={row.updatedAt} format="relative" />
      </span>
    ),
  },
];

/** Every playlist on the server, whoever owns it. A row opens the playlist. */
export function AllPlaylistsView() {
  const trpc = useTRPC();
  const router = useRouter();
  const table = useDataTable({ columns, getRowId: (row) => String(row.id), urlKey: "playlists", defaultSort: [{ id: "name", desc: false }] });
  const playlists = useQuery(trpc.admin.playlists.list.queryOptions(table.queryInput, { placeholderData: (previous) => previous }));

  return (
    <Page>
      {playlists.isError ? (
        <LoadError error={playlists.error} />
      ) : (
        <DataTable
          api={table}
          columns={columns}
          data={playlists.data?.rows ?? []}
          total={playlists.data?.total ?? 0}
          isLoading={playlists.isPending}
          isFetching={playlists.isFetching}
          searchPlaceholder="Playlist or owner"
          onRowClick={(row) => router.push(`/playlists/${row.id}`)}
          emptyMessage="No playlists match."
        />
      )}
    </Page>
  );
}
