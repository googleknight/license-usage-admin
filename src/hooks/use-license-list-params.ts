"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { DEFAULT_QUERY, PAGE_SIZES } from "@/lib/licenses/query";
import {
  LICENSE_PLANS,
  LICENSE_STATUSES,
  SORT_FIELDS,
  type LicensePlan,
  type LicenseQuery,
  type LicenseStatus,
  type SortDirection,
  type SortField,
} from "@/lib/licenses/types";

const PARAM = {
  search: "q",
  status: "status",
  plan: "plan",
  sort: "sort",
  direction: "dir",
  page: "page",
  pageSize: "size",
} as const;

export interface LicenseListParams {
  query: LicenseQuery;
  setSearch: (search: string) => void;
  toggleStatus: (status: LicenseStatus) => void;
  togglePlan: (plan: LicensePlan) => void;
  setSort: (field: SortField) => void;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  clearFilters: () => void;
  hasActiveFilters: boolean;
}

/**
 * Narrows an arbitrary string list to the members of a known union. A
 * hand-written `?status=Active&status=Active` should count once, not twice.
 */
function keepKnown<T extends string>(values: string[], allowed: readonly T[]): T[] {
  const known = values.filter((value): value is T =>
    (allowed as readonly string[]).includes(value),
  );
  return [...new Set(known)];
}

function parsePositiveInt(raw: string | null, fallback: number): number {
  if (raw === null) return fallback;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const toggle = <T,>(list: T[], value: T): T[] =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

/**
 * Holds list state in the URL rather than component state (assumption A8), so
 * a filtered view is shareable, the back button works, and a refresh is lossless.
 */
export function useLicenseListParams(): LicenseListParams {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const query = useMemo<LicenseQuery>(() => {
    const sortRaw = searchParams.get(PARAM.sort);
    const sortField: SortField = (SORT_FIELDS as readonly string[]).includes(sortRaw ?? "")
      ? (sortRaw as SortField)
      : DEFAULT_QUERY.sortField;

    const directionRaw = searchParams.get(PARAM.direction);
    const sortDirection: SortDirection = directionRaw === "desc" ? "desc" : "asc";

    const pageSizeRaw = parsePositiveInt(searchParams.get(PARAM.pageSize), DEFAULT_QUERY.pageSize);
    const pageSize = (PAGE_SIZES as readonly number[]).includes(pageSizeRaw)
      ? pageSizeRaw
      : DEFAULT_QUERY.pageSize;

    return {
      search: searchParams.get(PARAM.search) ?? "",
      statuses: keepKnown<LicenseStatus>(searchParams.getAll(PARAM.status), LICENSE_STATUSES),
      plans: keepKnown<LicensePlan>(searchParams.getAll(PARAM.plan), LICENSE_PLANS),
      sortField,
      sortDirection,
      page: parsePositiveInt(searchParams.get(PARAM.page), 1),
      pageSize,
    };
  }, [searchParams]);

  const commit = useCallback(
    (next: URLSearchParams) => {
      const queryString = next.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  /** Rebuilds the params from a whole query object, omitting defaults to keep URLs short. */
  const write = useCallback(
    (next: LicenseQuery) => {
      const params = new URLSearchParams();
      if (next.search.trim()) params.set(PARAM.search, next.search);
      next.statuses.forEach((status) => params.append(PARAM.status, status));
      next.plans.forEach((plan) => params.append(PARAM.plan, plan));
      if (next.sortField !== DEFAULT_QUERY.sortField) params.set(PARAM.sort, next.sortField);
      if (next.sortDirection !== DEFAULT_QUERY.sortDirection) {
        params.set(PARAM.direction, next.sortDirection);
      }
      if (next.page > 1) params.set(PARAM.page, String(next.page));
      if (next.pageSize !== DEFAULT_QUERY.pageSize) {
        params.set(PARAM.pageSize, String(next.pageSize));
      }
      commit(params);
    },
    [commit],
  );

  return {
    query,

    // Narrowing the result set resets to page 1, so nobody lands on a page that no longer exists.
    setSearch: (search: string) => write({ ...query, search, page: 1 }),
    toggleStatus: (status: LicenseStatus) =>
      write({ ...query, statuses: toggle(query.statuses, status), page: 1 }),
    togglePlan: (plan: LicensePlan) =>
      write({ ...query, plans: toggle(query.plans, plan), page: 1 }),

    /** Clicking the active sort column flips direction, a new column starts ascending. */
    setSort: (field: SortField) =>
      write({
        ...query,
        sortField: field,
        sortDirection: query.sortField === field && query.sortDirection === "asc" ? "desc" : "asc",
        page: 1,
      }),

    setPage: (page: number) => write({ ...query, page }),
    setPageSize: (pageSize: number) => write({ ...query, pageSize, page: 1 }),

    // Clears search and both facets. Sort and page size are display preferences,
    // not filters, so they survive.
    clearFilters: () =>
      write({
        ...DEFAULT_QUERY,
        sortField: query.sortField,
        sortDirection: query.sortDirection,
        pageSize: query.pageSize,
      }),

    hasActiveFilters:
      query.search.trim() !== "" || query.statuses.length > 0 || query.plans.length > 0,
  };
}
