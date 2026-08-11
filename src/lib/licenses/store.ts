import { LICENSE_FIXTURES } from "./fixtures";
import type { License } from "./types";

/**
 * A module-level mutable array standing in for a database (assumption A9).
 * This resets whenever the server restarts and is not safe across multiple
 * workers. Adequate for an exercise, but it is a mock, not a store.
 */
let licenses: License[] = LICENSE_FIXTURES.map((license) => ({ ...license }));

export function getAllLicenses(): License[] {
  return licenses.map((license) => ({ ...license }));
}

export function findLicense(id: string): License | undefined {
  const found = licenses.find((license) => license.id === id);
  return found ? { ...found } : undefined;
}

export function setSeatsAllowed(id: string, seatsAllowed: number): License | undefined {
  const index = licenses.findIndex((license) => license.id === id);
  if (index === -1) return undefined;

  const current = licenses[index];
  if (!current) return undefined;

  const updated: License = { ...current, seatsAllowed };
  licenses[index] = updated;
  return { ...updated };
}

/** Test and development helper: restores the fixture state. */
export function resetStore(): void {
  licenses = LICENSE_FIXTURES.map((license) => ({ ...license }));
}
