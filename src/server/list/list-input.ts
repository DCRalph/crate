import { z } from "zod";

/**
 * Shared, transport-agnostic contract for server-driven tables.
 *
 * Both the frontend `<DataTable>` and the tRPC `list` procedures speak this
 * shape: the client builds a {@link ListInput} (debounced) and the server turns
 * it into a Drizzle query with {@link buildListQuery}.
 *
 * This file is intentionally free of any server-only imports (no `db`, no
 * drizzle) so it can be imported from client components for its types.
 */

export const sortStateSchema = z.object({
  /** column id (matches the key in the server-side column map) */
  id: z.string(),
  /** descending when true, ascending otherwise */
  desc: z.boolean().default(false),
});

export const filterOperatorSchema = z.enum([
  "contains",
  "eq",
  "ne",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "between",
  "before",
  "after",
  "isTrue",
  "isFalse",
]);

export const columnFilterSchema = z.object({
  /** column id (matches the key in the server-side column map) */
  id: z.string(),
  operator: filterOperatorSchema,
  /**
   * Operator argument. Scalars for comparisons, a 2-tuple for `between`, a list
   * for `in`. `isTrue`/`isFalse` ignore the value.
   */
  value: z
    .union([
      z.string(),
      z.number(),
      z.boolean(),
      z.array(z.string()),
      z.array(z.number()),
    ])
    .nullish(),
});

/**
 * Build a `list` procedure input schema. Page-size bounds are configurable so
 * heavier tables can opt into larger pages.
 */
export function createListInputSchema(opts?: {
  defaultPageSize?: number;
  maxPageSize?: number;
}) {
  const defaultPageSize = opts?.defaultPageSize ?? 25;
  const maxPageSize = opts?.maxPageSize ?? 200;

  return z.object({
    /** free-text term applied to every `searchable` text column */
    search: z.string().trim().optional(),
    /** ordered sort directives — first has highest priority */
    sort: z.array(sortStateSchema).default([]),
    /** per-column filters, AND-ed together */
    filters: z.array(columnFilterSchema).default([]),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(maxPageSize).default(defaultPageSize),
  });
}

/** The default input schema — use directly or pass to {@link createListInputSchema}. */
export const listInputSchema = createListInputSchema();

export type ListInput = z.infer<typeof listInputSchema>;
export type SortState = z.infer<typeof sortStateSchema>;
export type ColumnFilter = z.infer<typeof columnFilterSchema>;
export type FilterOperator = z.infer<typeof filterOperatorSchema>;

/** Shape returned by every `list` procedure. Generic over the row type. */
export interface ListResult<TRow> {
  rows: TRow[];
  total: number;
  page: number;
  pageSize: number;
}
