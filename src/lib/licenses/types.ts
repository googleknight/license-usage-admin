export const LICENSE_PLANS = ["Trial", "Standard", "Enterprise"] as const;
export type LicensePlan = (typeof LICENSE_PLANS)[number];

export const LICENSE_STATUSES = [
  "Active",
  "Expiring Soon",
  "Expired",
  "Suspended",
] as const;
export type LicenseStatus = (typeof LICENSE_STATUSES)[number];

/** Days before renewal at which a license is considered "Expiring Soon" (assumption A1). */
export const EXPIRING_SOON_WINDOW_DAYS = 30;

export interface License {
  id: string;
  customerName: string;
  plan: LicensePlan;
  status: LicenseStatus;
  seatsUsed: number;
  seatsAllowed: number;
  /** ISO YYYY-MM-DD */
  renewalDate: string;
  accountOwnerEmail: string;
  /** ISO YYYY-MM-DD */
  createdDate: string;
  notes: string;
}

export const SORT_FIELDS = [
  "customerName",
  "plan",
  "status",
  "utilization",
  "renewalDate",
] as const;
export type SortField = (typeof SORT_FIELDS)[number];
export type SortDirection = "asc" | "desc";

export interface LicenseQuery {
  search: string;
  statuses: LicenseStatus[];
  plans: LicensePlan[];
  sortField: SortField;
  sortDirection: SortDirection;
  page: number;
  pageSize: number;
}

export interface LicenseQueryResult {
  rows: License[];
  /** Rows matching search and filters, before pagination. */
  totalMatching: number;
  /** Rows in the dataset, ignoring search and filters. */
  totalOverall: number;
  /** Clamped to the available range. */
  page: number;
  pageCount: number;
}

/**
 * Seat utilisation as a ratio. Guards against a zero allowance, which would
 * otherwise divide by zero (assumption A2).
 */
export function utilization(license: License): number {
  if (license.seatsAllowed === 0) return 0;
  return license.seatsUsed / license.seatsAllowed;
}
