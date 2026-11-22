import { and, asc, Column, desc, eq, gt, gte, ilike, inArray, is, lt, lte, ne, or, sql, type AnyColumn, type SQL } from "drizzle-orm";

import type { ColumnFilter, ListInput, ListResult } from "./list-input";

/**
 * Turns the table's `ListInput` into the pieces of a Drizzle query. The column
 * map you pass is also the allowlist: the server only ever sorts, filters and
 * searches on columns named in it, so a client can't reach any other column.
 *
 *   const columns = {
 *     name: { column: user.name, type: "text", searchable: true, sortable: true },
 *     role: { column: user.role, type: "enum", filterable: true },
 *   } satisfies ListColumnMap;
 *   const query = buildListQuery(columns, input, { defaultSort: [asc(user.id)] });
 *   db.select().from(user).where(query.where).orderBy(...query.orderBy).limit(query.limit).offset(query.offset);
 */
export type ListColumnType = "text" | "number" | "date" | "boolean" | "enum";

export interface ListColumnDef {
  /** The column or SQL expression this id stands for. */
  column: AnyColumn | SQL;
  /** Decides how filter values are read and which operators apply. */
  type: ListColumnType;
  /** Included in the free-text search (text columns only). */
  searchable?: boolean;
  sortable?: boolean;
  filterable?: boolean;
}

export type ListColumnMap = Record<string, ListColumnDef>;

const like = (text: string) => `%${text.replace(/[\\%_]/g, "\\$&")}%`;

/** Every column is compared as a plain expression, so a real column and a computed one behave the same. */
const expression = (column: AnyColumn | SQL): SQL => (is(column, Column) ? sql`${column}` : column);

function coerce(def: ListColumnDef, value: string | number | boolean) {
  // Dates travel as ISO text, which Postgres reads as a timestamp on its own.
  if (def.type === "date" && typeof value !== "boolean") return new Date(value).toISOString();
  if (def.type === "number" && typeof value === "string") {
    const number = Number(value);
    return Number.isNaN(number) ? value : number;
  }
  return value;
}

function buildFilter(def: ListColumnDef, filter: ColumnFilter): SQL | undefined {
  const column = expression(def.column);
  const raw = filter.value;
  const one = raw == null || Array.isArray(raw) ? undefined : coerce(def, raw);

  switch (filter.operator) {
    case "contains":
      return typeof raw === "string" && raw ? ilike(column, like(raw)) : undefined;
    case "eq":
      return one === undefined ? undefined : eq(column, one);
    case "ne":
      return one === undefined ? undefined : ne(column, one);
    case "gt":
    case "after":
      return one === undefined ? undefined : gt(column, one);
    case "gte":
      return one === undefined ? undefined : gte(column, one);
    case "lt":
    case "before":
      return one === undefined ? undefined : lt(column, one);
    case "lte":
      return one === undefined ? undefined : lte(column, one);
    case "in":
      return Array.isArray(raw) && raw.length ? inArray(column, raw.map((value) => coerce(def, value))) : undefined;
    case "between":
      return Array.isArray(raw) && raw.length === 2
        ? and(gte(column, coerce(def, raw[0]!)), lte(column, coerce(def, raw[1]!)))
        : undefined;
    case "isTrue":
      return eq(column, true);
    case "isFalse":
      return eq(column, false);
  }
}

export function buildListQuery(columns: ListColumnMap, input: ListInput, options: { defaultSort: SQL[]; where?: SQL }) {
  const searchable = Object.values(columns).filter((def) => def.searchable && def.type === "text");
  const term = input.search?.trim();
  // A search with nothing to search in matches nothing, not everything.
  const search = term ? or(...searchable.map((def) => ilike(expression(def.column), like(term)))) : undefined;

  const filters = input.filters.flatMap((filter) => {
    const def = columns[filter.id];
    return def?.filterable ? [buildFilter(def, filter)] : [];
  });

  const sort = input.sort.flatMap((state) => {
    const def = columns[state.id];
    return def?.sortable ? [state.desc ? desc(expression(def.column)) : asc(expression(def.column))] : [];
  });

  return {
    where: and(options.where, search, ...filters),
    // The default sort always follows, so rows that tie keep one order from page to page.
    orderBy: [...sort, ...options.defaultSort],
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
  };
}

/** The shape every `list` procedure returns. */
export const listResult = <TRow>(rows: TRow[], total: number, input: ListInput): ListResult<TRow> => ({
  rows,
  total,
  page: input.page,
  pageSize: input.pageSize,
});
