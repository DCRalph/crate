"use client";

import { ArrowDown, ArrowDownUp, ArrowUp, X } from "lucide-react";
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";

import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { cn } from "~/lib/utils";
import { DataTableCell } from "./cells";
import { DataTablePagination } from "./data-table-pagination";
import { DataTableToolbar } from "./data-table-toolbar";
import type { BulkAction, DataTableColumn } from "./types";
import type { DataTableApi } from "./use-data-table";
import {
  fitsWidth,
  TableWidthProvider,
  useElementWidth,
} from "./use-table-width";

export interface DataTableProps<TRow> {
  /** State container from `useDataTable`. */
  api: DataTableApi<TRow>;
  columns: DataTableColumn<TRow>[];
  /** Current page of rows (already fetched from the server). */
  data: TRow[];
  /** Total row count across all pages (for pagination). */
  total: number;
  /** Initial load — shows skeleton rows. */
  isLoading?: boolean;
  /** Background refetch (debounced query in flight): the rows dim until it lands. */
  isFetching?: boolean;
  onRowClick?: (row: TRow) => void;
  /** Second click on a row. Pairs with `onRowClick` the way a file list does. */
  onRowDoubleClick?: (row: TRow) => void;
  /** Makes rows draggable (native HTML5 drag); called as a drag starts. */
  onRowDragStart?: (row: TRow, event: DragEvent<HTMLTableRowElement>) => void;
  bulkActions?: BulkAction<TRow>[];
  /** Show the selection column. Defaults to true when `bulkActions` is set. */
  enableSelection?: boolean;
  enableSearch?: boolean;
  /**
   * Show the toolbar (search / sort / filter / column menu). Defaults to true.
   * Set false for small, fully-loaded sub-tables that only need to present rows.
   */
  enableToolbar?: boolean;
  /**
   * Show the pagination footer. Defaults to true. Set false for small,
   * fully-loaded local data sets (e.g. detail-page sub-tables) that aren't
   * server-paginated, so the footer doesn't render dead controls.
   */
  enablePagination?: boolean;
  searchPlaceholder?: string;
  /** Extra toolbar controls on the right (e.g. an "Add" button). */
  toolbarActions?: ReactNode;
  /**
   * A bar inside the card, under the rows. For summaries and for actions that
   * apply to the whole list rather than to the current selection — the
   * selection bar at the top of the card already covers that.
   */
  footer?: ReactNode;
  emptyMessage?: string;
  /** Pin the header row to the top of the page's scroll area. */
  stickyHeader?: boolean;
  title?: ReactNode;
  description?: ReactNode;
  className?: string;
}

function alignClass(align?: "left" | "right" | "center") {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}

/**
 * An unpaginated table mounts this many rows, then this many more each time the
 * last one scrolls into view, so a few thousand rows never render at once.
 */
const RENDER_STEP = 200;

type RowHandlers<TRow> = Pick<
  DataTableProps<TRow>,
  "onRowClick" | "onRowDoubleClick" | "onRowDragStart"
> & { toggleRow: (id: string) => void };

type RowProps<TRow> = {
  row: TRow;
  id: string;
  selected: boolean;
  columns: DataTableColumn<TRow>[];
  enableSelection: boolean;
  clickable: boolean;
  draggable: boolean;
  handlers: { current: RowHandlers<TRow> };
};

/**
 * One body row. Memoised so a selection change or a refetch re-renders only the
 * rows it touched; the handlers come through a ref so a parent's fresh
 * closures do not count as a change.
 */
const DataTableRow = memo(function DataTableRow<TRow>({
  row,
  id,
  selected,
  columns,
  enableSelection,
  clickable,
  draggable,
  handlers,
}: RowProps<TRow>) {
  return (
    <TableRow
      // For whatever wraps the table to tell which row something happened on, a right-click say.
      data-row-id={id}
      data-state={selected ? "selected" : undefined}
      className={cn("border-border", clickable && "cursor-pointer")}
      onClick={clickable ? () => handlers.current.onRowClick?.(row) : undefined}
      // A double click on a control in the row is two clicks on that control.
      onDoubleClick={(event) => {
        if (event.target instanceof Element && event.target.closest("button, a, input, [role=checkbox], [role=slider]")) return;
        handlers.current.onRowDoubleClick?.(row);
      }}
      draggable={draggable || undefined}
      onDragStart={
        draggable
          ? (event) => handlers.current.onRowDragStart?.(row, event)
          : undefined
      }
    >
      {enableSelection && (
        <TableCell className="pl-4 max-sm:hidden" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            aria-label="Select row"
            checked={selected}
            onCheckedChange={() => handlers.current.toggleRow(id)}
          />
        </TableCell>
      )}
      {columns.map((column) => (
        <TableCell
          key={column.id}
          className={cn(alignClass(column.align), column.className)}
        >
          <DataTableCell column={column} row={row} />
        </TableCell>
      ))}
    </TableRow>
  );
  // memo() drops the generic; this puts it back.
}) as <TRow>(props: RowProps<TRow>) => ReactNode;

/** Grows the rendered row count whenever the sentinel row comes into view. */
function useRenderLimit(enabled: boolean, total: number) {
  const [limit, setLimit] = useState(RENDER_STEP);
  const sentinel = useRef<HTMLTableRowElement>(null);
  const hasMore = enabled && total > limit;
  useEffect(() => {
    const element = sentinel.current;
    if (!hasMore || !element || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setLimit((n) => n + RENDER_STEP);
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMore, limit]);
  return { limit: enabled ? limit : Infinity, sentinel };
}

export function DataTable<TRow>({
  api,
  columns,
  data,
  total,
  isLoading = false,
  isFetching = false,
  onRowClick,
  onRowDoubleClick,
  onRowDragStart,
  bulkActions,
  enableSelection = Boolean(bulkActions),
  enableSearch = true,
  enableToolbar = true,
  enablePagination = true,
  searchPlaceholder,
  toolbarActions,
  footer,
  emptyMessage = "No results.",
  stickyHeader = false,
  title,
  description,
  className,
}: DataTableProps<TRow>) {
  const cardRef = useRef<HTMLDivElement>(null);
  const tableWidth = useElementWidth(cardRef);

  // Columns the table is wide enough for. This is also what the toolbar menus
  // offer, so the column menu never lists something the width has already
  // taken away.
  const affordable = useMemo(
    () => columns.filter((c) => fitsWidth(c.showFrom, tableWidth)),
    [columns, tableWidth],
  );
  // Kept stable so the memoised rows only re-render when the columns change.
  const { isColumnVisible } = api;
  const visibleColumns = useMemo(
    () => affordable.filter((c) => isColumnVisible(c.id)),
    [affordable, isColumnVisible],
  );
  const handlers = useRef<RowHandlers<TRow>>({ toggleRow: api.toggleRow });
  useEffect(() => {
    handlers.current = {
      onRowClick,
      onRowDoubleClick,
      onRowDragStart,
      toggleRow: api.toggleRow,
    };
  });
  const { limit, sentinel } = useRenderLimit(!enablePagination, data.length);
  const shown = data.length > limit ? data.slice(0, limit) : data;
  const pageIds = data.map((row) => api.getRowId(row));
  const allSelected =
    pageIds.length > 0 && pageIds.every((id) => api.isSelected(id));
  const someSelected = pageIds.some((id) => api.isSelected(id));
  const selectedCount = api.selected.size;
  const colSpan = visibleColumns.length + (enableSelection ? 1 : 0);

  return (
    <TableWidthProvider value={tableWidth}>
      <div className={cn("flex flex-col gap-4", className)}>
        {(title || description) && (
          <div className="flex flex-col gap-0.5">
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {description && (
              <p className="text-muted-foreground text-sm">{description}</p>
            )}
          </div>
        )}

        {enableToolbar && (
          <DataTableToolbar
            columns={affordable}
            api={api}
            enableSearch={enableSearch}
            searchPlaceholder={searchPlaceholder}
            actions={toolbarActions}
          />
        )}

        <div
          ref={cardRef}
          className={cn(
            "print relative rounded-lg shadow-[0_1px_2px_rgb(0_0_0/0.14)]",
            // Clip rather than hide: a hidden overflow is a scroll container,
            // and the sticky header would stick to it instead of the page.
            stickyHeader ? "overflow-clip" : "overflow-hidden",
          )}
        >
          {/* Selection bar. It exists to host bulk actions: with none to offer it
            would say only what a footer or a toolbar already says. */}
          {enableSelection && selectedCount > 0 && bulkActions?.length ? (
            <div className="border-border bg-accent/40 flex flex-wrap items-center gap-2 border-b px-4 py-2.5 text-sm">
              <span className="font-medium">{selectedCount} selected</span>
              <div className="ml-auto flex items-center gap-2">
                {bulkActions?.map((action) => (
                  <Button
                    key={action.label}
                    size="sm"
                    variant={action.variant ?? "outline"}
                    onClick={() => action.onClick(api.getSelectedRows(data))}
                  >
                    {action.icon && <action.icon className="size-4" />}
                    {action.label}
                  </Button>
                ))}
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Clear selection"
                  onClick={api.clearSelection}
                >
                  <X />
                </Button>
              </div>
            </div>
          ) : null}

          <Table stickyHeader={stickyHeader}>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                {enableSelection && (
                  <TableHead className="w-10 pl-4 max-sm:hidden">
                    <Checkbox
                      aria-label="Select all on this page"
                      checked={
                        allSelected
                          ? true
                          : someSelected
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={(value) =>
                        api.setPageSelection(pageIds, value === true)
                      }
                    />
                  </TableHead>
                )}
                {visibleColumns.map((column) => {
                  const sortState = api.sort[0];
                  const isSorted = sortState?.id === column.id;
                  return (
                    <TableHead
                      key={column.id}
                      aria-sort={isSorted ? (sortState.desc ? "descending" : "ascending") : undefined}
                      className={cn(
                        "",
                        alignClass(column.align),
                        column.sortable && "cursor-pointer select-none",
                        column.headerClassName,
                      )}
                      onClick={
                        column.sortable
                          ? () => api.toggleSort(column.id)
                          : undefined
                      }
                    >
                      <span
                        className={cn(
                          "group/th inline-flex items-center gap-1.5",
                          column.align === "right" && "flex-row-reverse",
                        )}
                      >
                        {column.icon && <column.icon className="size-4" />}
                        {column.header}
                        {column.sortable &&
                          (isSorted ? (
                            sortState?.desc ? (
                              <ArrowDown className="size-3.5" />
                            ) : (
                              <ArrowUp className="size-3.5" />
                            )
                          ) : (
                            <ArrowDownUp className="size-3.5 opacity-0 transition-opacity group-hover/th:opacity-50" />
                          ))}
                      </span>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>

            {/* Keyed, so the first rows fade in where the placeholders were. A later page or sort only dims. */}
            <TableBody
              key={isLoading ? "loading" : "rows"}
              className={cn(
                !isLoading && "animate-arrive",
                "transition-opacity",
                isFetching && "opacity-60",
              )}
            >
              {isLoading &&
                Array.from({ length: Math.min(api.pageSize, 8) }).map(
                  (_, i) => (
                    <TableRow key={`skeleton-${i}`} className="border-border">
                      {enableSelection && (
                        <TableCell className="pl-4 max-sm:hidden">
                          <Skeleton className="size-4 rounded-[5px]" />
                        </TableCell>
                      )}
                      {visibleColumns.map((column) => (
                        <TableCell key={column.id}>
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ),
                )}

              {!isLoading &&
                shown.map((row) => {
                  const id = api.getRowId(row);
                  return (
                    <DataTableRow
                      key={id}
                      row={row}
                      id={id}
                      selected={api.isSelected(id)}
                      columns={visibleColumns}
                      enableSelection={enableSelection}
                      clickable={Boolean(onRowClick)}
                      draggable={Boolean(onRowDragStart)}
                      handlers={handlers}
                    />
                  );
                })}

              {!isLoading && shown.length < data.length && (
                <TableRow
                  ref={sentinel}
                  className="border-border hover:bg-transparent"
                >
                  <TableCell
                    colSpan={colSpan}
                    className="text-muted-foreground py-3 text-center text-xs"
                  >
                    {data.length - shown.length} more
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && data.length === 0 && (
                <TableRow className="border-border hover:bg-transparent">
                  <TableCell
                    colSpan={colSpan}
                    className="text-muted-foreground py-12 text-center text-sm whitespace-normal"
                  >
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {footer && (
            <div className="border-border border-t px-4 py-2.5">{footer}</div>
          )}
        </div>

        {enablePagination && (
          <DataTablePagination api={api} total={total} isLoading={isLoading} />
        )}
      </div>
    </TableWidthProvider>
  );
}
