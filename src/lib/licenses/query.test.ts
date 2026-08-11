import { describe, expect, test } from "bun:test";
import { DEFAULT_QUERY, queryLicenses } from "./query";
import type { License, LicenseQuery } from "./types";

function license(overrides: Partial<License> = {}): License {
  return {
    id: "lic_001",
    customerName: "Northwind Industries",
    plan: "Standard",
    status: "Active",
    seatsUsed: 5,
    seatsAllowed: 10,
    renewalDate: "2026-12-01",
    accountOwnerEmail: "owner@example.com",
    createdDate: "2024-01-01",
    notes: "",
    ...overrides,
  };
}

function query(overrides: Partial<LicenseQuery> = {}): LicenseQuery {
  return { ...DEFAULT_QUERY, ...overrides };
}

describe("search", () => {
  const rows = [
    license({ id: "a", customerName: "Northwind Industries" }),
    license({ id: "b", customerName: "Contoso Group" }),
  ];

  test("matches a case-insensitive substring", () => {
    expect(queryLicenses(rows, query({ search: "north" })).rows.map((r) => r.id)).toEqual(["a"]);
  });

  test("trims surrounding whitespace", () => {
    expect(queryLicenses(rows, query({ search: "  contoso  " })).rows.map((r) => r.id)).toEqual(["b"]);
  });

  test("an empty search returns everything", () => {
    expect(queryLicenses(rows, query({ search: "" })).rows).toHaveLength(2);
  });

  test("searches the customer name only, not notes", () => {
    const withNote = [license({ id: "a", customerName: "Acme", notes: "northwind migration" })];
    expect(queryLicenses(withNote, query({ search: "northwind" })).rows).toHaveLength(0);
  });
});

describe("filters", () => {
  const rows = [
    license({ id: "a", status: "Active", plan: "Trial" }),
    license({ id: "b", status: "Expired", plan: "Enterprise" }),
    license({ id: "c", status: "Suspended", plan: "Trial" }),
  ];

  test("an empty facet does not filter", () => {
    expect(queryLicenses(rows, query({ statuses: [] })).rows).toHaveLength(3);
  });

  test("multi-select within a facet is an OR", () => {
    const result = queryLicenses(rows, query({ statuses: ["Active", "Expired"] }));
    expect(result.rows.map((r) => r.id).sort()).toEqual(["a", "b"]);
  });

  test("separate facets combine as an AND", () => {
    const result = queryLicenses(rows, query({ statuses: ["Active", "Suspended"], plans: ["Trial"] }));
    expect(result.rows.map((r) => r.id).sort()).toEqual(["a", "c"]);
  });
});

describe("sorting", () => {
  test("sorts by customer name", () => {
    const rows = [license({ id: "b", customerName: "Zeta" }), license({ id: "a", customerName: "Alpha" })];
    const result = queryLicenses(rows, query({ sortField: "customerName", sortDirection: "asc" }));
    expect(result.rows.map((r) => r.id)).toEqual(["a", "b"]);
  });

  test("sorts plan by tier, not alphabetically", () => {
    const rows = [
      license({ id: "ent", plan: "Enterprise" }),
      license({ id: "tri", plan: "Trial" }),
      license({ id: "std", plan: "Standard" }),
    ];
    const result = queryLicenses(rows, query({ sortField: "plan", sortDirection: "asc" }));
    expect(result.rows.map((r) => r.id)).toEqual(["tri", "std", "ent"]);
  });

  test("sorts status by lifecycle order, not alphabetically", () => {
    const rows = [
      license({ id: "susp", status: "Suspended" }),
      license({ id: "act", status: "Active" }),
      license({ id: "exp", status: "Expired" }),
      license({ id: "soon", status: "Expiring Soon" }),
    ];
    const result = queryLicenses(rows, query({ sortField: "status", sortDirection: "asc" }));
    expect(result.rows.map((r) => r.id)).toEqual(["act", "soon", "exp", "susp"]);
  });

  test("sorts seats by utilisation, not by raw allowance (assumption A2)", () => {
    const rows = [
      license({ id: "low", seatsUsed: 10, seatsAllowed: 100 }),
      license({ id: "high", seatsUsed: 9, seatsAllowed: 10 }),
    ];
    const result = queryLicenses(rows, query({ sortField: "utilization", sortDirection: "desc" }));
    expect(result.rows.map((r) => r.id)).toEqual(["high", "low"]);
  });

  test("treats a zero allowance as zero utilisation rather than dividing by zero", () => {
    const rows = [
      license({ id: "zero", seatsUsed: 0, seatsAllowed: 0 }),
      license({ id: "some", seatsUsed: 1, seatsAllowed: 10 }),
    ];
    const result = queryLicenses(rows, query({ sortField: "utilization", sortDirection: "asc" }));
    expect(result.rows.map((r) => r.id)).toEqual(["zero", "some"]);
  });

  test("descending reverses the order", () => {
    const rows = [license({ id: "a", renewalDate: "2026-01-01" }), license({ id: "b", renewalDate: "2027-01-01" })];
    const result = queryLicenses(rows, query({ sortField: "renewalDate", sortDirection: "desc" }));
    expect(result.rows.map((r) => r.id)).toEqual(["b", "a"]);
  });

  test("is stable, falling back to id for equal keys", () => {
    const rows = [
      license({ id: "b", customerName: "Same" }),
      license({ id: "a", customerName: "Same" }),
    ];
    const result = queryLicenses(rows, query({ sortField: "customerName" }));
    expect(result.rows.map((r) => r.id)).toEqual(["a", "b"]);
  });

  test("does not mutate the input array", () => {
    const rows = [license({ id: "b", customerName: "Zeta" }), license({ id: "a", customerName: "Alpha" })];
    queryLicenses(rows, query({ sortField: "customerName" }));
    expect(rows.map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("pagination", () => {
  const rows = Array.from({ length: 25 }, (_, i) =>
    license({ id: `lic_${String(i).padStart(2, "0")}`, customerName: `Customer ${String(i).padStart(2, "0")}` }),
  );
  const base = { sortField: "customerName", sortDirection: "asc" } as const;

  test("returns only the requested page", () => {
    const result = queryLicenses(rows, query({ ...base, page: 2, pageSize: 10 }));
    expect(result.rows).toHaveLength(10);
    expect(result.rows[0]?.id).toBe("lic_10");
  });

  test("the last page may be partial", () => {
    const result = queryLicenses(rows, query({ ...base, page: 3, pageSize: 10 }));
    expect(result.rows).toHaveLength(5);
  });

  test("clamps a page beyond the end", () => {
    const result = queryLicenses(rows, query({ ...base, page: 99, pageSize: 10 }));
    expect(result.page).toBe(3);
    expect(result.rows).toHaveLength(5);
  });

  test("clamps a page below one", () => {
    expect(queryLicenses(rows, query({ ...base, page: 0, pageSize: 10 })).page).toBe(1);
  });

  test("reports counts before and after filtering", () => {
    const result = queryLicenses(rows, query({ ...base, search: "Customer 0", pageSize: 10 }));
    expect(result.totalOverall).toBe(25);
    expect(result.totalMatching).toBe(10);
  });

  test("an empty dataset yields one page and no rows", () => {
    const result = queryLicenses([], query());
    expect(result.rows).toHaveLength(0);
    expect(result.pageCount).toBe(1);
    expect(result.page).toBe(1);
  });
});
