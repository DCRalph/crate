"use client";

import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { cn } from "~/lib/utils";
import { DataTableActiveFilters, DataTableFilters } from "./data-table-filters";
import type { DataTableColumn } from "./types";
import type { DataTableApi } from "./use-data-table";

function SortMenu<TRow>({
  columns,
  api,
}: {
  columns: DataTableColumn<TRow>[];
  api: DataTableApi<TRow>;
}) {
  const sortable = columns.filter((c) => c.sortable);
  if (sortable.length === 0) return null;

  const active = api.sort[0];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Sort"
          className={cn(active && "text-foreground")}
        >
          <ArrowDownUp />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-1 p-2">
        <Label className="text-muted-foreground px-2 py-1.5 text-xs">
          Sort by
        </Label>
        {sortable.map((column) => {
          const isActive = active?.id === column.id;
          return (
            <div
              key={column.id}
              className="flex items-center justify-between gap-2 rounded-lg px-2 py-1"
            >
              <span className="flex items-center gap-1.5 text-sm">
                {column.icon && (
                  <column.icon className="text-muted-foreground size-4" />
                )}
                {column.header}
              </span>
              <div className="flex items-center gap-0.5">
                <Button
                  variant={isActive && !active?.desc ? "secondary" : "ghost"}
                  size="icon-xs"
                  aria-label={`Sort ${column.header} ascending`}
                  onClick={() => api.setSortDirection(column.id, false)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant={isActive && active?.desc ? "secondary" : "ghost"}
                  size="icon-xs"
                  aria-label={`Sort ${column.header} descending`}
                  onClick={() => api.setSortDirection(column.id, true)}
                >
                  <ArrowDown />
                </Button>
              </div>
            </div>
          );
        })}
        {active && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 justify-start"
            onClick={api.clearSort}
          >
            <X className="size-3.5" />
            Clear sorting
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ColumnToggle<TRow>({
  columns,
  api,
}: {
  columns: DataTableColumn<TRow>[];
  api: DataTableApi<TRow>;
}) {
  const hideable = columns.filter((c) => c.hideable !== false);
  if (hideable.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Toggle columns">
          <SlidersHorizontal />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 gap-1 p-2">
        <Label className="text-muted-foreground px-2 py-1.5 text-xs">
          Columns
        </Label>
        {hideable.map((column) => (
          <label
            key={column.id}
            className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5"
          >
            <Checkbox
              checked={api.isColumnVisible(column.id)}
              onCheckedChange={() => api.toggleColumn(column.id)}
            />
            {column.icon && (
              <column.icon className="text-muted-foreground size-4" />
            )}
            <span className="text-sm">{column.header}</span>
          </label>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 justify-start"
          onClick={api.resetColumns}
        >
          Reset
        </Button>
      </PopoverContent>
    </Popover>
  );
}

export function DataTableToolbar<TRow>({
  columns,
  api,
  searchPlaceholder = "Search…",
  enableSearch = true,
  actions,
}: {
  columns: DataTableColumn<TRow>[];
  api: DataTableApi<TRow>;
  searchPlaceholder?: string;
  enableSearch?: boolean;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {enableSearch && (
          <div className="relative min-w-[200px] flex-1 sm:max-w-72">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={api.search}
              onChange={(e) => api.setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="pl-9"
            />
            {api.search && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => api.setSearch("")}
                className="text-muted-foreground hover:bg-muted hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 rounded-full p-0.5"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-0.5">
          <SortMenu columns={columns} api={api} />
          <DataTableFilters columns={columns} api={api} />
          <ColumnToggle columns={columns} api={api} />
          {actions && (
            <div className="ml-1.5 flex items-center gap-2">{actions}</div>
          )}
        </div>
      </div>

      <DataTableActiveFilters columns={columns} api={api} />
    </div>
  );
}
