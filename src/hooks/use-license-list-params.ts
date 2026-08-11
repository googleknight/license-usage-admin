"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { DEFAULT_QUERY } from "@/lib/licenses/query";
import { parseLicenseQuery, serializeLicenseQuery } from "@/lib/licenses/params";
import type {
  LicensePlan,
  LicenseQuery,
  LicenseStatus,
  SortField,
} from "@/lib/licenses/types";

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

const toggle = <T,>(list: T[], value: T): T[] =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

/**
 * Holds list state in the URL rather than component state (assumption A8), so a
 * filtered view is shareable and a refresh is lossless. Writes use
 * `router.replace`, not `push`, so a debounced search does not stack a history
 * entry per keystroke; the trade-off is that the back button does not step
 * through filter changes. Parsing and serialising live in the pure
 * `lib/licenses/params` module so they can be tested without the hook.
 */
export function useLicenseListParams(): LicenseListParams {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const query = useMemo<LicenseQuery>(
    () => parseLicenseQuery(searchParams),
    [searchParams],
  );

  const commit = useCallback(
    (next: URLSearchParams) => {
      const queryString = next.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  /** Rebuilds the URL from a whole query object. */
  const write = useCallback(
    (next: LicenseQuery) => commit(serializeLicenseQuery(next)),
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
