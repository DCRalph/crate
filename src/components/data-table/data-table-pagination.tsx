"use client";

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { cn } from "~/lib/utils";
import type { DataTableApi } from "./use-data-table";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function DataTablePagination<TRow>({
  api,
  total,
  isLoading = false,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
}: {
  api: DataTableApi<TRow>;
  total: number;
  /** The first page is still on its way, so there is nothing to count yet. */
  isLoading?: boolean;
  pageSizeOptions?: number[];
}) {
  const { page, pageSize, setPage, setPageSize } = api;
  const [sizesOpen, setSizesOpen] = useState(false);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  // A page past the end (rows were deleted, or the address is an old one) goes back to the last page there is.
  useEffect(() => {
    if (!isLoading && total > 0 && page > pageCount) setPage(pageCount);
  }, [isLoading, total, page, pageCount, setPage]);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-3 px-1 text-sm">
      <div className="flex items-center gap-3">
        <span className={cn("tabular-nums", isLoading && "invisible")}>
          {from.toLocaleString()} to {to.toLocaleString()} of {total.toLocaleString()}
        </span>
        <Popover open={sizesOpen} onOpenChange={setSizesOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2">
              {pageSize} / page
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-32 gap-0.5 p-1">
            {pageSizeOptions.map((size) => (
              <Button
                key={size}
                variant={size === pageSize ? "secondary" : "ghost"}
                size="sm"
                className="justify-start"
                onClick={() => {
                  setPageSize(size);
                  setSizesOpen(false);
                }}
              >
                {size} / page
              </Button>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex items-center gap-1">
        <span className={cn("mr-2 tabular-nums", isLoading && "invisible")}>
          Page {page} of {pageCount}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="First page"
          onClick={() => setPage(1)}
          disabled={page <= 1}
        >
          <ChevronsLeft />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Previous page"
          onClick={() => setPage(Math.max(1, page - 1))}
          disabled={page <= 1}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Next page"
          onClick={() => setPage(Math.min(pageCount, page + 1))}
          disabled={page >= pageCount}
        >
          <ChevronRight />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Last page"
          onClick={() => setPage(pageCount)}
          disabled={page >= pageCount}
        >
          <ChevronsRight />
        </Button>
      </div>
    </div>
  );
}
