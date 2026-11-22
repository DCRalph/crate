import { Check, Minus } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import type { DataTableColumn } from "./types";

export function getCellValue<TRow>(
  column: DataTableColumn<TRow>,
  row: TRow,
): unknown {
  if (column.accessor) return column.accessor(row);
  return (row as Record<string, unknown>)[column.id];
}

function formatDate(value: unknown): string {
  if (value == null || value === "") return "-";
  const date = value instanceof Date ? value : new Date(value as string);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Renders a single cell using the column's `cell` override or its `type`. */
export function DataTableCell<TRow>({
  column,
  row,
}: {
  column: DataTableColumn<TRow>;
  row: TRow;
}) {
  if (column.cell) return <>{column.cell(row)}</>;

  const value = getCellValue(column, row);

  switch (column.type) {
    case "badge": {
      const meta = column.badge?.(value, row) ?? {};
      const label = meta.label ?? (value == null ? "" : String(value));
      if (!label) return <span className="text-muted-foreground">-</span>;
      return (
        <Badge
          variant={meta.variant ?? "outline"}
          className="gap-1.5 font-medium"
        >
          {meta.dotClassName && (
            <span className={cn("size-1.5 rounded-full", meta.dotClassName)} />
          )}
          {label}
        </Badge>
      );
    }
    case "email":
      return value ? (
        <a
          href={`mailto:${String(value)}`}
          onClick={(e) => e.stopPropagation()}
          className="text-muted-foreground hover:text-foreground hover:underline"
        >
          {String(value)}
        </a>
      ) : (
        <span className="text-muted-foreground">-</span>
      );
    case "number":
      return (
        <span className="tabular-nums">
          {value == null || value === "" ? "-" : String(value)}
        </span>
      );
    case "date":
      return <span className="text-muted-foreground">{formatDate(value)}</span>;
    case "boolean":
      return value ? (
        <Check className="text-ok size-4" />
      ) : (
        <Minus className="text-muted-foreground size-4" />
      );
    default:
      return (
        <span>
          {value == null || value === "" ? (
            <span className="text-muted-foreground">-</span>
          ) : (
            String(value)
          )}
        </span>
      );
  }
}
