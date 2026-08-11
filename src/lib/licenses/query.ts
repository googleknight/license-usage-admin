import {
  LICENSE_PLANS,
  LICENSE_STATUSES,
  utilization,
  type License,
  type LicenseQuery,
  type LicenseQueryResult,
} from "./types";

export const PAGE_SIZES = [10, 25, 50] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

/**
 * Renewal date ascending: the soonest expiry is why an admin opens this screen.
 */
export const DEFAULT_QUERY: LicenseQuery = {
  search: "",
  statuses: [],
  plans: [],
  sortField: "renewalDate",
  sortDirection: "asc",
  page: 1,
  pageSize: 25,
};

/** Tier order, so Trial sorts below Enterprise rather than alphabetically. */
const planRank = (license: License): number => LICENSE_PLANS.indexOf(license.plan);

/** Lifecycle order: Active, Expiring Soon, Expired, Suspended. */
const statusRank = (license: License): number => LICENSE_STATUSES.indexOf(license.status);

function compare(a: License, b: License, field: LicenseQuery["sortField"]): number {
  switch (field) {
    case "customerName":
      return a.customerName.localeCompare(b.customerName);
    case "plan":
      return planRank(a) - planRank(b);
    case "status":
      return statusRank(a) - statusRank(b);
    case "utilization":
      return utilization(a) - utilization(b);
    case "renewalDate":
      // ISO YYYY-MM-DD sorts correctly as a string, no Date parsing needed.
      return a.renewalDate.localeCompare(b.renewalDate);
  }
}

export function queryLicenses(all: License[], query: LicenseQuery): LicenseQueryResult {
  const search = query.search.trim().toLowerCase();

  const matching = all.filter((license) => {
    if (search && !license.customerName.toLowerCase().includes(search)) return false;
    if (query.statuses.length > 0 && !query.statuses.includes(license.status)) return false;
    if (query.plans.length > 0 && !query.plans.includes(license.plan)) return false;
    return true;
  });

  const direction = query.sortDirection === "asc" ? 1 : -1;
  const sorted = [...matching].sort((a, b) => {
    const primary = compare(a, b, query.sortField);
    // Fall back to id so equal keys produce a deterministic order.
    return primary !== 0 ? primary * direction : a.id.localeCompare(b.id);
  });

  const pageCount = Math.max(1, Math.ceil(sorted.length / query.pageSize));
  const page = Math.min(Math.max(1, query.page), pageCount);
  const start = (page - 1) * query.pageSize;

  return {
    rows: sorted.slice(start, start + query.pageSize),
    totalMatching: sorted.length,
    totalOverall: all.length,
    page,
    pageCount,
  };
}
