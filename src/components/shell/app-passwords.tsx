"use client";

import { useConfirm } from "~/components/confirm-provider";
import { DataTable, useDataTable, type DataTableColumn } from "~/components/data-table";
import { LocalTime } from "~/components/local-time";
import { Button } from "~/components/ui/button";
import type { RouterOutputs } from "~/trpc/react";

type Row = RouterOutputs["account"]["appPasswords"][number];

/**
 * App passwords as a table: what each is called, when and where it was last
 * used, and a Revoke button that asks first. Shared by Music apps and the
 * admin's user page, so it is handed its rows and never fetches.
 */
export function AppPasswordTable({ rows, onRevoke, emptyMessage }: { rows: Row[]; onRevoke: (row: Row) => void; emptyMessage: string }) {
  const confirm = useConfirm();
  const columns: DataTableColumn<Row>[] = [
    { id: "name", header: "Name", cell: (row) => <span className="font-medium">{row.name}</span> },
    {
      id: "lastUsedAt",
      header: "Last used",
      cell: (row) => <LocalTime date={row.lastUsedAt} format="relative" className="text-muted-foreground tabular-nums" />,
    },
    // The app's own name for itself, as in the logs.
    { id: "lastUsedClient", header: "App", showFrom: 560, cell: (row) => <span className="text-muted-foreground">{row.lastUsedClient ?? ""}</span> },
    {
      id: "lastUsedIp",
      header: "Address",
      showFrom: 680,
      cell: (row) => <span className="text-muted-foreground font-mono text-xs">{row.lastUsedIp ?? ""}</span>,
    },
    {
      id: "createdAt",
      header: "Added",
      showFrom: 460,
      cell: (row) => <LocalTime date={row.createdAt} format="date" className="text-muted-foreground tabular-nums" />,
    },
    {
      id: "revoke",
      header: "",
      align: "right",
      className: "py-0",
      cell: (row) => (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Revoke ${row.name}`}
          onClick={async () => {
            const ok = await confirm({
              title: `Revoke ${row.name}?`,
              description: "It will stop working straight away.",
              confirmLabel: "Revoke",
              variant: "destructive",
            });
            if (ok) onRevoke(row);
          }}
        >
          Revoke
        </Button>
      ),
    },
  ];
  const table = useDataTable({ columns, getRowId: (row) => String(row.id), storageKey: "app-passwords" });

  return <DataTable api={table} columns={columns} data={rows} total={rows.length} enableToolbar={false} enablePagination={false} emptyMessage={emptyMessage} />;
}
