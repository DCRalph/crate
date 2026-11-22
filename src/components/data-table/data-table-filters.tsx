"use client";

import { ArrowLeft, ListFilter, X } from "lucide-react";
import { useState } from "react";

import { Badge } from "~/components/ui/badge";
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
import type {
  ColumnFilter,
  FilterOperator,
} from "~/server/list/list-input";
import type { DataTableApi } from "./use-data-table";
import {
  OPERATOR_LABELS,
  OPERATORS_BY_TYPE,
  type DataTableColumn,
} from "./types";

function operatorsFor<TRow>(column: DataTableColumn<TRow>): FilterOperator[] {
  return OPERATORS_BY_TYPE[column.type ?? "text"];
}

/** Human-readable description of an active filter, used for the chips. */
function describeFilter<TRow>(
  column: DataTableColumn<TRow>,
  filter: ColumnFilter,
): string {
  const opLabel = OPERATOR_LABELS[filter.operator];
  const value = filter.value;

  if (filter.operator === "isTrue" || filter.operator === "isFalse") {
    return `${column.header} ${opLabel}`;
  }
  if (filter.operator === "in" && Array.isArray(value)) {
    const labels = value.map((v) => {
      const opt = column.options?.find((o) => o.value === String(v));
      return opt?.label ?? String(v);
    });
    return `${column.header}: ${labels.join(", ")}`;
  }
  if (filter.operator === "between" && Array.isArray(value)) {
    return `${column.header} ${opLabel} ${String(value[0])} – ${String(value[1])}`;
  }
  return `${column.header} ${opLabel} ${String(value ?? "")}`;
}

function FilterEditor<TRow>({
  column,
  current,
  onApply,
  onCancel,
}: {
  column: DataTableColumn<TRow>;
  current?: ColumnFilter;
  onApply: (filter: ColumnFilter) => void;
  onCancel: () => void;
}) {
  const operators = operatorsFor(column);
  const [operator, setOperator] = useState<FilterOperator>(
    current?.operator ?? operators[0]!,
  );
  const [text, setText] = useState<string>(
    typeof current?.value === "string" || typeof current?.value === "number"
      ? String(current.value)
      : "",
  );
  const [text2, setText2] = useState<string>(
    Array.isArray(current?.value) && current.value.length === 2
      ? String(current.value[1])
      : "",
  );
  const [selected, setSelected] = useState<string[]>(
    Array.isArray(current?.value) && column.type === "badge"
      ? (current.value as (string | number)[]).map(String)
      : [],
  );

  const isNumber = column.type === "number";
  const isBetween = operator === "between";

  function apply() {
    if (column.type === "boolean") {
      onApply({ id: column.id, operator, value: null });
      return;
    }
    if (column.type === "badge") {
      if (selected.length === 0) return;
      onApply({ id: column.id, operator: "in", value: selected });
      return;
    }
    if (isBetween) {
      if (!text || !text2) return;
      const value = isNumber ? [Number(text), Number(text2)] : [text, text2];
      onApply({ id: column.id, operator, value });
      return;
    }
    if (!text) return;
    onApply({
      id: column.id,
      operator,
      value: isNumber ? Number(text) : text,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onCancel}
          aria-label="Back"
        >
          <ArrowLeft />
        </Button>
        <span className="flex items-center gap-1.5 text-sm font-medium">
          {column.icon && (
            <column.icon className="text-muted-foreground size-4" />
          )}
          {column.header}
        </span>
      </div>

      {operators.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {operators.map((op) => (
            <Button
              key={op}
              size="xs"
              variant={operator === op ? "secondary" : "ghost"}
              onClick={() => setOperator(op)}
            >
              {OPERATOR_LABELS[op]}
            </Button>
          ))}
        </div>
      )}

      {column.type === "boolean" ? null : column.type === "badge" ? (
        <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
          {column.options?.map((opt) => {
            const checked = selected.includes(opt.value);
            return (
              <label
                key={opt.value}
                className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(value) =>
                    setSelected((prev) =>
                      value
                        ? [...prev, opt.value]
                        : prev.filter((v) => v !== opt.value),
                    )
                  }
                />
                {opt.dotClassName && (
                  <span
                    className={cn("size-2 rounded-full", opt.dotClassName)}
                  />
                )}
                <span className="text-sm">{opt.label}</span>
              </label>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            type={
              column.type === "date" ? "date" : isNumber ? "number" : "text"
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && apply()}
            placeholder="Value"
            className="h-8"
          />
          {isBetween && (
            <>
              <span className="text-muted-foreground text-xs">and</span>
              <Input
                type={column.type === "date" ? "date" : "number"}
                value={text2}
                onChange={(e) => setText2(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && apply()}
                placeholder="Value"
                className="h-8"
              />
            </>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        {current && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onApply({ id: column.id, operator, value: null })}
          >
            Remove
          </Button>
        )}
        <Button size="sm" onClick={apply}>
          Apply
        </Button>
      </div>
    </div>
  );
}

/** Toolbar "Filter" button: pick a column, then edit its filter. */
export function DataTableFilters<TRow>({
  columns,
  api,
}: {
  columns: DataTableColumn<TRow>[];
  api: DataTableApi<TRow>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const filterable = columns.filter((c) => c.filterable);
  if (filterable.length === 0) return null;

  const activeCount = api.filters.length;
  const editingColumn = filterable.find((c) => c.id === editing) ?? null;

  function close() {
    setOpen(false);
    setEditing(null);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setEditing(null);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Filter"
          className="relative"
        >
          <ListFilter />
          {activeCount > 0 && (
            <span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full text-2xs font-semibold">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-0 p-2">
        {editingColumn ? (
          <FilterEditor
            column={editingColumn}
            current={api.filters.find((f) => f.id === editingColumn.id)}
            onApply={(filter) => {
              if (
                filter.value === null &&
                filter.operator !== "isTrue" &&
                filter.operator !== "isFalse"
              ) {
                api.removeFilter(filter.id);
              } else {
                api.upsertFilter(filter);
              }
              close();
            }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <div className="flex flex-col gap-0.5">
            <Label className="text-muted-foreground px-2 py-1.5 text-xs">
              Filter by
            </Label>
            {filterable.map((column) => {
              const active = api.filters.some((f) => f.id === column.id);
              return (
                <button
                  key={column.id}
                  type="button"
                  onClick={() => setEditing(column.id)}
                  className="hover:bg-muted flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm"
                >
                  {column.icon && (
                    <column.icon className="text-muted-foreground size-4" />
                  )}
                  <span className="flex-1">{column.header}</span>
                  {active && (
                    <span className="bg-primary size-1.5 rounded-full" />
                  )}
                </button>
              );
            })}
            {activeCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 justify-start"
                onClick={() => {
                  api.clearFilters();
                  close();
                }}
              >
                Clear all filters
              </Button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Removable chips for the currently-active filters. */
export function DataTableActiveFilters<TRow>({
  columns,
  api,
}: {
  columns: DataTableColumn<TRow>[];
  api: DataTableApi<TRow>;
}) {
  if (api.filters.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {api.filters.map((filter) => {
        const column = columns.find((c) => c.id === filter.id);
        if (!column) return null;
        return (
          <Badge
            key={filter.id}
            variant="secondary"
            className="h-6 gap-1 pr-1 pl-2.5"
          >
            <span className="max-w-52 truncate">
              {describeFilter(column, filter)}
            </span>
            <button
              type="button"
              aria-label={`Remove ${column.header} filter`}
              onClick={() => api.removeFilter(filter.id)}
              className="hover:bg-foreground/10 rounded-full p-0.5"
            >
              <X className="size-3" />
            </button>
          </Badge>
        );
      })}
      <Button variant="ghost" size="xs" onClick={api.clearFilters}>
        Clear
      </Button>
    </div>
  );
}
