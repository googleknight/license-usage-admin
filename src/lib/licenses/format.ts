import { utilization, type License } from "./types";

/**
 * Fixed locale and UTC on purpose. Formatting with the ambient locale or
 * timezone renders differently on the server and the client, which produces a
 * hydration mismatch. This is correctness, not internationalisation support.
 */
const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** Formats an ISO YYYY-MM-DD string, e.g. "04 Sep 2026". */
export function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return DATE_FORMAT.format(date);
}

/** Seat utilisation as a whole percentage, e.g. "80%". */
export function formatUtilization(license: License): string {
  return `${Math.round(utilization(license) * 100)}%`;
}

/** True when a customer is using more seats than they are allowed (assumption A3). */
export function isOverProvisioned(license: License): boolean {
  return license.seatsUsed > license.seatsAllowed;
}
