"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import type {
  ColumnFilter,
  ListInput,
  SortState,
} from "~/server/list/list-input";
import type { DataTableColumn } from "./types";

export interface UseDataTableOptions<TRow> {
  /** Column definitions — used to seed default-hidden columns. */
  columns: DataTableColumn<TRow>[];
  /** Stable id for a row (used for selection + React keys). */
  getRowId: (row: TRow) => string;
  /** Rows per page. Defaults to 25. */
  pageSize?: number;
  /** Initial sort. */
  defaultSort?: SortState[];
  /** Debounce (ms) applied to search/sort/filter before they hit the query. Defaults to 300. */
  debounceMs?: number;
  /**
   * When set, search/sort/filter/page are mirrored to the URL query string
   * under this prefix (so views are shareable + survive refresh). Multiple
   * tables on one page just need distinct prefixes.
   */
  urlKey?: string;
  /** localStorage namespace for column visibility. Defaults to `urlKey ?? "default"`. */
  storageKey?: string;
}

export interface DataTableApi<TRow> {
  // --- raw (immediate) state, for the inputs ---
  search: string;
  setSearch: (value: string) => void;
  sort: SortState[];
  toggleSort: (id: string) => void;
  setSortDirection: (id: string, desc: boolean) => void;
  clearSort: () => void;
  filters: ColumnFilter[];
  upsertFilter: (filter: ColumnFilter) => void;
  removeFilter: (id: string) => void;
  clearFilters: () => void;
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;

  // --- column visibility ---
  hiddenColumns: Set<string>;
  isColumnVisible: (id: string) => boolean;
  toggleColumn: (id: string) => void;
  resetColumns: () => void;

  // --- selection (scoped to the current page) ---
  selected: Set<string>;
  isSelected: (id: string) => boolean;
  toggleRow: (id: string) => void;
  setPageSelection: (ids: string[], checked: boolean) => void;
  clearSelection: () => void;
  getSelectedRows: (rows: TRow[]) => TRow[];

  /** Stable id getter, surfaced for the renderer. */
  getRowId: (row: TRow) => string;

  /** The DEBOUNCED input to feed straight into `api.x.list.useQuery(...)`. */
  queryInput: ListInput;
}

/**
 * Which columns are hidden, kept in localStorage under `key`. Read through
 * useSyncExternalStore so the server and the first client render both see the
 * defaults and the saved choice arrives without a hydration mismatch. Setting
 * null forgets the saved choice, which is the defaults again.
 */
function useStoredHidden(key: string, defaults: string[]) {
  const subscribe = useCallback(
    (notify: () => void) => {
      window.addEventListener("storage", notify);
      window.addEventListener(key, notify);
      return () => {
        window.removeEventListener("storage", notify);
        window.removeEventListener(key, notify);
      };
    },
    [key],
  );
  const saved = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const hidden = useMemo(() => {
    try {
      if (saved) return new Set(JSON.parse(saved) as string[]);
    } catch {
      /* fall through to the defaults */
    }
    return new Set(defaults);
  }, [saved, defaults]);
  const setHidden = useCallback(
    (next: Set<string> | null) => {
      try {
        if (next) window.localStorage.setItem(key, JSON.stringify([...next]));
        else window.localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new Event(key));
    },
    [key],
  );
  return [hidden, setHidden] as const;
}

const isDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
const dayStart = (day: string) => new Date(`${day}T00:00:00`).toISOString();
const dayEnd = (day: string) => new Date(`${day}T23:59:59.999`).toISOString();

/**
 * A date filter holds the days that were picked ("2026-11-22"), and the
 * server compares moments. Each day becomes the moment it starts or ends
 * where the person is: "after" a day is after it ends, "before" is before it
 * starts, and "between" runs from the start of the first to the end of the last.
 */
function asMoments(filter: ColumnFilter): ColumnFilter {
  const { operator, value } = filter;
  if (operator === "after" && isDay(value)) return { ...filter, value: dayEnd(value) };
  if (operator === "before" && isDay(value)) return { ...filter, value: dayStart(value) };
  if (operator === "between" && Array.isArray(value) && isDay(value[0]) && isDay(value[1])) {
    return { ...filter, value: [dayStart(value[0]), dayEnd(value[1])] };
  }
  return filter;
}

/** Debounce any serialisable value. */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  const latest = useRef(value);
  // Kept in step after each render, so the timer below reads the newest value without restarting on every one.
  useEffect(() => {
    latest.current = value;
  });
  const key = JSON.stringify(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(latest.current), delay);
    return () => clearTimeout(handle);
  }, [key, delay]);

  return debounced;
}

function serializeSort(sort: SortState[]): string {
  return sort.map((s) => `${s.id}.${s.desc ? "desc" : "asc"}`).join(",");
}

function parseSort(raw: string | null): SortState[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => {
      const [id, dir] = part.split(".");
      if (!id) return null;
      return { id, desc: dir === "desc" } satisfies SortState;
    })
    .filter((s): s is SortState => s !== null);
}

function parseFilters(raw: string | null): ColumnFilter[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as ColumnFilter[]) : [];
  } catch {
    return [];
  }
}

export function useDataTable<TRow>(
  options: UseDataTableOptions<TRow>,
): DataTableApi<TRow> {
  const {
    columns,
    getRowId,
    pageSize: initialPageSize = 25,
    defaultSort = [],
    debounceMs = 300,
    urlKey,
    storageKey = urlKey ?? "default",
  } = options;

  // Read once for SSR-correct initial state; writes go through history.replaceState.
  const searchParams = useSearchParams();

  const param = useCallback(
    (name: string) => (urlKey ? `${urlKey}_${name}` : name),
    [urlKey],
  );

  // --- initial state (hydrated from the URL when urlKey is set) ---
  const [search, setSearchState] = useState<string>(() =>
    urlKey ? (searchParams.get(param("q")) ?? "") : "",
  );
  const [sort, setSort] = useState<SortState[]>(() => {
    const raw = urlKey ? searchParams.get(param("sort")) : null;
    return raw ? parseSort(raw) : defaultSort;
  });
  const [filters, setFilters] = useState<ColumnFilter[]>(() =>
    urlKey ? parseFilters(searchParams.get(param("filters"))) : [],
  );
  const [page, setPageState] = useState<number>(() =>
    urlKey ? Number(searchParams.get(param("page"))) || 1 : 1,
  );
  const [pageSize, setPageSizeState] = useState<number>(() =>
    urlKey ? Number(searchParams.get(param("size"))) || initialPageSize : initialPageSize,
  );

  // --- column visibility (persisted to localStorage) ---
  const defaultHidden = useMemo(
    () => columns.filter((c) => c.defaultHidden).map((c) => c.id),
    [columns],
  );
  const [hiddenColumns, setHiddenColumns] = useStoredHidden(`dt:${storageKey}:hidden`, defaultHidden);

  // --- selection ---
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // --- mutators (reset to page 1 whenever the result set changes) ---
  const setSearch = useCallback((value: string) => {
    setSearchState(value);
    setPageState(1);
  }, []);

  const toggleSort = useCallback((id: string) => {
    setPageState(1);
    setSort((prev) => {
      const current = prev[0];
      if (current?.id === id) {
        return current.desc ? [] : [{ id, desc: true }];
      }
      return [{ id, desc: false }];
    });
  }, []);

  const setSortDirection = useCallback((id: string, desc: boolean) => {
    setPageState(1);
    setSort([{ id, desc }]);
  }, []);

  const clearSort = useCallback(() => {
    setPageState(1);
    setSort([]);
  }, []);

  const upsertFilter = useCallback((filter: ColumnFilter) => {
    setPageState(1);
    setFilters((prev) => {
      const next = prev.filter((f) => f.id !== filter.id);
      next.push(filter);
      return next;
    });
  }, []);

  const removeFilter = useCallback((id: string) => {
    setPageState(1);
    setFilters((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clearFilters = useCallback(() => {
    setPageState(1);
    setFilters([]);
  }, []);

  const setPage = useCallback((next: number) => setPageState(next), []);
  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setPageState(1);
  }, []);

  const isColumnVisible = useCallback(
    (id: string) => !hiddenColumns.has(id),
    [hiddenColumns],
  );
  const toggleColumn = useCallback(
    (id: string) => {
      const next = new Set(hiddenColumns);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setHiddenColumns(next);
    },
    [hiddenColumns, setHiddenColumns],
  );
  const resetColumns = useCallback(() => setHiddenColumns(null), [setHiddenColumns]);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);
  const toggleRow = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const setPageSelection = useCallback((ids: string[], checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelected(new Set()), []);
  const getSelectedRows = useCallback(
    (rows: TRow[]) => rows.filter((r) => selected.has(getRowId(r))),
    [selected, getRowId],
  );

  // --- query input ---
  // Only typing waits: a sort or a filter is one deliberate click, and is asked for at once.
  const debouncedSearch = useDebouncedValue(search.trim() || undefined, debounceMs);
  const debouncedCriteria = useMemo(
    () => ({ search: debouncedSearch, sort, filters: filters.map(asMoments) }),
    [debouncedSearch, sort, filters],
  );

  const queryInput = useMemo<ListInput>(
    () => ({ ...debouncedCriteria, page, pageSize }),
    [debouncedCriteria, page, pageSize],
  );

  // Selection is page-scoped: drop it whenever the rows underneath it change.
  // Sorting is deliberately not in that key — it reorders the same rows, and
  // losing a selection to a click on a column header is a nasty surprise.
  const rowSetKey = JSON.stringify({
    search: debouncedCriteria.search,
    filters: debouncedCriteria.filters,
    page,
    pageSize,
  });
  const firstSelectionClear = useRef(true);
  useEffect(() => {
    if (firstSelectionClear.current) {
      firstSelectionClear.current = false;
      return;
    }
    setSelected(new Set());
  }, [rowSetKey]);

  // --- mirror state to the URL via history.replaceState ---
  // The History API updates the URL for sharing and refresh without a
  // navigation or refetch. The state passed is null on purpose: Next only
  // picks the new URL up (for useSearchParams, and so a later refresh keeps
  // it) when the call doesn't carry Next's own history state.
  const firstUrlSync = useRef(true);
  useEffect(() => {
    if (!urlKey || typeof window === "undefined") return;
    if (firstUrlSync.current) {
      firstUrlSync.current = false;
      return;
    }
    // Read the live URL each time so sibling params are always preserved.
    const next = new URLSearchParams(window.location.search);

    const setOrDelete = (name: string, value: string) => {
      if (value) next.set(param(name), value);
      else next.delete(param(name));
    };

    setOrDelete("q", search.trim());
    setOrDelete("sort", serializeSort(sort));
    setOrDelete("filters", filters.length ? JSON.stringify(filters) : "");
    setOrDelete("page", page > 1 ? String(page) : "");
    // Kept beside the page, or coming Back would count the page in a different size and could land past the end.
    setOrDelete("size", pageSize !== initialPageSize ? String(pageSize) : "");

    const qs = next.toString();
    const url = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [search, sort, filters, page, pageSize, initialPageSize, urlKey, param]);

  return {
    search,
    setSearch,
    sort,
    toggleSort,
    setSortDirection,
    clearSort,
    filters,
    upsertFilter,
    removeFilter,
    clearFilters,
    page,
    setPage,
    pageSize,
    setPageSize,
    hiddenColumns,
    isColumnVisible,
    toggleColumn,
    resetColumns,
    selected,
    isSelected,
    toggleRow,
    setPageSelection,
    clearSelection,
    getSelectedRows,
    getRowId,
    queryInput,
  };
}
