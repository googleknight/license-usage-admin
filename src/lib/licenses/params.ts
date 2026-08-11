import { DEFAULT_QUERY, PAGE_SIZES } from "./query";
import {
  LICENSE_PLANS,
  LICENSE_STATUSES,
  SORT_FIELDS,
  type LicensePlan,
  type LicenseQuery,
  type LicenseStatus,
  type SortDirection,
  type SortField,
} from "./types";

/** The search-param names that hold list state. */
export const PARAM = {
  search: "q",
  status: "status",
  plan: "plan",
  sort: "sort",
  direction: "dir",
  page: "page",
  pageSize: "size",
} as const;

/**
 * The read side of a URLSearchParams. Next's `useSearchParams` returns a
 * ReadonlyURLSearchParams, which lacks the mutating methods, so accepting only
 * `get`/`getAll` lets both it and a plain URLSearchParams flow through.
 */
type ReadableParams = Pick<URLSearchParams, "get" | "getAll">;

/**
 * Narrows an arbitrary string list to the members of a known union. A
 * hand-written `?status=Active&status=Active` should count once, not twice,
 * and `?status=Bogus` should drop out entirely.
 */
export function keepKnown<T extends string>(values: string[], allowed: readonly T[]): T[] {
  const known = values.filter((value): value is T =>
    (allowed as readonly string[]).includes(value),
  );
  return [...new Set(known)];
}

/** Parses a positive integer param, falling back on anything else (`-1`, `0`, `abc`, absent). */
export function parsePositiveInt(raw: string | null, fallback: number): number {
  if (raw === null) return fallback;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Reads a whole LicenseQuery out of the URL, tolerating hand-edited params:
 * unknown statuses/plans drop, an unknown sort field or page size falls back to
 * the default, and a non-positive page falls back to 1. Pure, so the parsing is
 * testable without rendering the hook.
 */
export function parseLicenseQuery(params: ReadableParams): LicenseQuery {
  const sortRaw = params.get(PARAM.sort);
  const sortField: SortField = (SORT_FIELDS as readonly string[]).includes(sortRaw ?? "")
    ? (sortRaw as SortField)
    : DEFAULT_QUERY.sortField;

  const directionRaw = params.get(PARAM.direction);
  const sortDirection: SortDirection = directionRaw === "desc" ? "desc" : "asc";

  const pageSizeRaw = parsePositiveInt(params.get(PARAM.pageSize), DEFAULT_QUERY.pageSize);
  const pageSize = (PAGE_SIZES as readonly number[]).includes(pageSizeRaw)
    ? pageSizeRaw
    : DEFAULT_QUERY.pageSize;

  return {
    search: params.get(PARAM.search) ?? "",
    statuses: keepKnown<LicenseStatus>(params.getAll(PARAM.status), LICENSE_STATUSES),
    plans: keepKnown<LicensePlan>(params.getAll(PARAM.plan), LICENSE_PLANS),
    sortField,
    sortDirection,
    page: parsePositiveInt(params.get(PARAM.page), 1),
    pageSize,
  };
}

/** Serialises a query back to the URL, omitting anything at its default to keep URLs short. */
export function serializeLicenseQuery(query: LicenseQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.search.trim()) params.set(PARAM.search, query.search);
  query.statuses.forEach((status) => params.append(PARAM.status, status));
  query.plans.forEach((plan) => params.append(PARAM.plan, plan));
  if (query.sortField !== DEFAULT_QUERY.sortField) params.set(PARAM.sort, query.sortField);
  if (query.sortDirection !== DEFAULT_QUERY.sortDirection) {
    params.set(PARAM.direction, query.sortDirection);
  }
  if (query.page > 1) params.set(PARAM.page, String(query.page));
  if (query.pageSize !== DEFAULT_QUERY.pageSize) {
    params.set(PARAM.pageSize, String(query.pageSize));
  }
  return params;
}
