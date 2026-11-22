"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { DataTable, useDataTable, useTableWidth, type DataTableColumn } from "~/components/data-table";
import { LocalTime } from "~/components/local-time";
import { Page } from "~/components/shell/page";
import { LoadError } from "~/components/shell/states";
import { Status } from "~/components/shell/status";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { useTRPC, type RouterOutputs } from "~/trpc/react";

type Row = RouterOutputs["admin"]["users"]["list"]["rows"][number];

/** The table width, in px, from which the User cell has room for the display name beside the username. */
const nameFrom = 560;

/** The username, linked to the person's page, with their display name beside it when the table has room. */
function UserCell({ row }: { row: Row }) {
  const width = useTableWidth();
  const username = row.username ?? row.name;
  return (
    <span className="flex items-center gap-2">
      {/* The row is clickable for the mouse; this link is the same destination for the keyboard. */}
      <Link
        href={`/admin/users/${row.id}`}
        className="font-medium outline-none hover:underline focus-visible:underline"
        onClick={(event) => event.stopPropagation()}
      >
        {username}
      </Link>
      {row.name !== username && (width === null || width >= nameFrom) ? <span className="text-muted-foreground text-xs">{row.name}</span> : null}
    </span>
  );
}

// The ids are the server's: admin.users.list sorts and filters on these names.
const columns: DataTableColumn<Row>[] = [
  { id: "username", header: "User", sortable: true, hideable: false, cell: (row) => <UserCell row={row} /> },
  {
    id: "role",
    header: "Role",
    type: "badge",
    sortable: true,
    filterable: true,
    options: [
      { label: "Admin", value: "admin" },
      { label: "User", value: "user" },
    ],
    cell: (row) => (row.role === "admin" ? <Badge variant="secondary">Admin</Badge> : <span className="text-muted-foreground">User</span>),
  },
  {
    id: "status",
    header: "Status",
    type: "badge",
    filterable: true,
    options: [
      { label: "Active", value: "active", dotClassName: "bg-ok" },
      { label: "Disabled", value: "disabled", dotClassName: "bg-destructive" },
    ],
    cell: (row) => (row.banned ? <Status tone="bad" label="Disabled" /> : <Status tone="ok" label="Active" />),
  },
  {
    id: "libraryCount",
    header: "Libraries",
    type: "number",
    align: "right",
    sortable: true,
    showFrom: 420,
    cell: (row) => <span className="text-muted-foreground tabular-nums">{row.role === "admin" ? "All" : row.libraryCount}</span>,
  },
  {
    id: "appPasswordCount",
    header: "Apps",
    type: "number",
    align: "right",
    showFrom: 640,
    cell: (row) => <span className="text-muted-foreground tabular-nums">{row.appPasswordCount}</span>,
  },
  {
    id: "createdAt",
    header: "Created",
    type: "date",
    sortable: true,
    showFrom: 900,
    cell: (row) => <LocalTime date={row.createdAt} format="date" className="text-muted-foreground tabular-nums" />,
  },
  {
    id: "lastSeenAt",
    header: "Last seen",
    type: "date",
    sortable: true,
    showFrom: 760,
    cell: (row) => <LocalTime date={row.lastSeenAt} format="relative" className="text-muted-foreground tabular-nums" />,
  },
];

/** Everyone with an account. A row opens that person's page. */
export function UsersView() {
  const trpc = useTRPC();
  const router = useRouter();
  const table = useDataTable({ columns, getRowId: (row) => row.id, urlKey: "users" });
  const users = useQuery(trpc.admin.users.list.queryOptions(table.queryInput, { placeholderData: (previous) => previous }));

  return (
    <Page>
      {users.isError ? (
        <LoadError message={users.error.message} />
      ) : (
        <DataTable
          api={table}
          columns={columns}
          data={users.data?.rows ?? []}
          total={users.data?.total ?? 0}
          isLoading={users.isPending}
          isFetching={users.isFetching}
          searchPlaceholder="Username or name"
          onRowClick={(row) => router.push(`/admin/users/${row.id}`)}
          emptyMessage="No users match."
          toolbarActions={
            <Button variant="brand" size="sm" asChild>
              <Link href="/admin/users/new">
                <Plus />
                New user
              </Link>
            </Button>
          }
        />
      )}
    </Page>
  );
}
