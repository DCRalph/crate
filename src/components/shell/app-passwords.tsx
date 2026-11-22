"use client";

import { Smartphone } from "lucide-react";

import { useConfirm } from "~/components/confirm-provider";
import { LocalTime } from "~/components/local-time";
import { Button } from "~/components/ui/button";
import { ListRow, ListRows } from "./list-row";

export type AppPasswordRow = {
  id: number;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  lastUsedIp: string | null;
  lastUsedClient: string | null;
};

/** App passwords as rows, each with when and where it was last used and a Revoke button. Shared by Account and the admin's user page. */
export function AppPasswordList({ rows, onRevoke }: { rows: AppPasswordRow[]; onRevoke: (row: AppPasswordRow) => void }) {
  const confirm = useConfirm();
  return (
    <ListRows>
      {rows.map((row) => (
        <ListRow
          key={row.id}
          icon={<Smartphone />}
          title={row.name}
          detail={
            row.lastUsedAt ? (
              <span className="tabular-nums">
                Last used <LocalTime date={row.lastUsedAt} format="relative" />
                {row.lastUsedClient ? ` · ${row.lastUsedClient}` : ""}
                {row.lastUsedIp ? <span className="font-mono"> · {row.lastUsedIp}</span> : null}
              </span>
            ) : (
              "Never used"
            )
          }
        >
          <Button
            variant="ghost"
            size="sm"
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
        </ListRow>
      ))}
    </ListRows>
  );
}
