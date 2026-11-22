import type { ComponentType, ReactNode } from "react";

import type { FilterOperator } from "~/server/list/list-input";

/**
 * Render type for a column. Drives both the default cell renderer and the
 * filter editor that the toolbar shows for this column.
 */
export type DataTableColumnType =
  | "text"
  | "number"
  | "date"
  | "badge"
  | "email"
  | "boolean";

export type DataTableBadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "ghost";

export interface DataTableBadge {
  label?: string;
  variant?: DataTableBadgeVariant;
  /** Tailwind class for a leading status dot, e.g. "bg-chart-1" or "bg-success". */
  dotClassName?: string;
}

export interface DataTableFilterOption {
  label: string;
  value: string;
  dotClassName?: string;
}

export interface DataTableColumn<TRow> {
  /**
   * Unique id. Also the default key used to read the value from a row AND the
   * id sent to the server for sort/filter — keep it in sync with the server
   * column map.
   */
  id: string;
  header: string;
  /** Optional header icon (a lucide / hugeicons component). */
  icon?: ComponentType<{ className?: string }>;
  /** Value type — picks the default renderer + filter editor. Defaults to "text". */
  type?: DataTableColumnType;
  /** Read the raw value from a row. Defaults to `row[id]`. */
  accessor?: (row: TRow) => unknown;
  /** Fully custom cell renderer. Overrides `type`. */
  cell?: (row: TRow) => ReactNode;
  /** Enable server-side sort on this column (header becomes clickable). */
  sortable?: boolean;
  /** Enable server-side filtering on this column. */
  filterable?: boolean;
  /** Options for `badge`/enum filters (the selectable set). */
  options?: DataTableFilterOption[];
  /** Map a value → badge appearance (for `type: "badge"`). */
  badge?: (value: unknown, row: TRow) => DataTableBadge;
  /** Text alignment. Numbers default to "right". */
  align?: "left" | "right" | "center";
  /** Whether the column can be hidden from the column menu. Defaults to true. */
  hideable?: boolean;
  /** Start hidden until toggled on in the column menu. */
  defaultHidden?: boolean;
  /**
   * Minimum table width, in px, before this column appears. Measured against
   * the table's own card rather than the window, since a sidebar or a rail can
   * take a third of the width without the window noticing. A column below its
   * width is also dropped from the sort and column menus, so neither ever
   * offers something the table is not showing.
   */
  showFrom?: number;
  /** Extra class on every cell in this column. */
  className?: string;
  /** Extra class on the header cell. */
  headerClassName?: string;
}

export interface BulkAction<TRow> {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onClick: (rows: TRow[]) => void;
  variant?: "default" | "outline" | "ghost" | "destructive";
}

/** The operators offered in the filter editor for each column type. */
export const OPERATORS_BY_TYPE: Record<DataTableColumnType, FilterOperator[]> =
  {
    text: ["contains", "eq", "ne"],
    number: ["eq", "gt", "gte", "lt", "lte", "between"],
    date: ["before", "after", "between"],
    badge: ["in"],
    email: ["contains", "eq"],
    boolean: ["isTrue", "isFalse"],
  };

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  contains: "contains",
  eq: "is",
  ne: "is not",
  gt: "greater than",
  gte: "≥",
  lt: "less than",
  lte: "≤",
  in: "is any of",
  between: "between",
  before: "before",
  after: "after",
  isTrue: "is true",
  isFalse: "is false",
};
