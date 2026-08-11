# License Usage Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single Next.js App Router admin screen that lists customer license records with search, filtering, sorting, pagination, a detail drawer, and a validated seats-allowed edit.

**Architecture:** Mock data is served by Route Handlers (`GET /api/licenses`, `PATCH /api/licenses/[id]`) backed by a module-level array, so loading, error, and pending states are real rather than simulated. All filtering, sorting, and pagination is pure functions over the fetched array, driven by state held in URL search params. The page is a thin server component wrapping one client component that owns fetch state.

**Tech Stack:** Next.js 16.3.0 (App Router), React 19.2.8, TypeScript 5.9 strict, Tailwind CSS 4, shadcn/ui, Bun 1.3 as package manager and test runner.

## Global Constraints

- **Runtime/package manager:** Bun. Every command is `bun ...`, never `npm` or `pnpm`.
- **Next.js version floor:** 16.3.0. This differs from older App Router conventions. **Read the relevant guide under `node_modules/next/dist/docs/` before writing framework code**, per the generated `AGENTS.md`. Do not write route handlers or async params from memory.
- **TypeScript:** `strict: true`. No `any`. No non-null assertions (`!`) on values that can genuinely be absent.
- **Styling:** Tailwind 4 + shadcn/ui only. No second styling system, no inline `<style>`, no CSS-in-JS.
- **No new runtime dependencies** beyond shadcn/ui primitives and their Radix peers. No state library, no data-fetching library, no date library, no test framework (Bun has one built in).
- **Dataset size:** 50 fixture records.
- **"Expiring Soon" window:** 30 days.
- **Seats upper bound:** `100000`.
- **Debounce:** 250 ms.
- **Dates:** stored as ISO `YYYY-MM-DD` strings, formatted with locale `en-GB` and `timeZone: 'UTC'`. Never `new Date().toLocaleDateString()` with no timezone, which causes a server/client hydration mismatch.
- **Writing rules:** no em dashes anywhere, including code comments and commit messages. Use commas, colons, parentheses, or separate sentences.
- **Commits:** no AI attribution. No `Co-Authored-By` trailer, no "Generated with" line.
- **Verification gate:** `bun test`, `bun run lint`, and `bun run build` must all pass before the final commit.

**Reference:** [`requirements/scope.md`](../requirements/scope.md) holds the assumptions (A1 to A9) referenced throughout.

---

## File Structure

```
src/
  app/
    api/licenses/route.ts              GET list, supports ?fail=1
    api/licenses/[id]/route.ts         PATCH seats allowed, supports ?fail=1
    page.tsx                           server shell, renders <LicensePage />
    layout.tsx                         (exists) metadata only
  components/
    licenses/
      license-page.tsx                 client root: owns fetch state, composes everything
      license-toolbar.tsx              search input + status/plan filters + clear
      license-search-input.tsx         debounced text input
      license-facet-filter.tsx         reusable multi-select popover for one facet
      license-table.tsx                table, sortable headers, row click
      license-table-skeleton.tsx       loading rows
      license-pagination.tsx           page controls + page size
      license-detail-drawer.tsx        right drawer, full record + seats form
      seats-edit-form.tsx              validated pessimistic PATCH
      status-badge.tsx                 status chip
      plan-badge.tsx                   plan chip
      states.tsx                       ErrorState, EmptyState, NoResultsState
    ui/                                shadcn generated primitives
  hooks/
    use-debounced-value.ts
    use-license-list-params.ts         URL search param state
    use-licenses.ts                    fetch + loading/error + local row update
  lib/
    licenses/
      types.ts                         License, unions, query and result types
      fixtures.ts                      generated, 50 records
      store.ts                         module-level mutable array
      query.ts                         pure filter/sort/paginate
      validation.ts                    seats validator
      format.ts                        date and utilisation formatting
scripts/
  generate-fixtures.ts                 deterministic fixture generator
```

Tests are colocated as `*.test.ts` beside the module under test, which is what `bun test` discovers by default.

---

### Task 1: Domain types and deterministic fixtures

**Files:**
- Create: `src/lib/licenses/types.ts`
- Create: `scripts/generate-fixtures.ts`
- Create: `src/lib/licenses/fixtures.ts` (generated output, committed)
- Modify: `package.json` (add `generate:fixtures` script)

**Interfaces:**
- Consumes: nothing
- Produces: `License`, `LicensePlan`, `LicenseStatus`, `LICENSE_PLANS`, `LICENSE_STATUSES`, `SortField`, `SortDirection`, `LicenseQuery`, `LicenseQueryResult`, `utilization()`, `LICENSE_FIXTURES`

- [ ] **Step 1: Write the types**

Create `src/lib/licenses/types.ts`:

```ts
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
```

- [ ] **Step 2: Write the fixture generator**

Create `scripts/generate-fixtures.ts`. It uses a seeded PRNG so output is byte-identical between runs, which keeps the committed fixture file free of pointless diffs:

```ts
import { writeFileSync } from "node:fs";
import type { License, LicensePlan, LicenseStatus } from "../src/lib/licenses/types";
import { EXPIRING_SOON_WINDOW_DAYS } from "../src/lib/licenses/types";

/** Deterministic PRNG (mulberry32) so regenerating without changing the seed is a no-op. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(20260811);

const pick = <T,>(items: readonly T[]): T =>
  items[Math.floor(random() * items.length)] as T;

const intBetween = (min: number, max: number): number =>
  min + Math.floor(random() * (max - min + 1));

const COMPANY_PREFIXES = [
  "Northwind", "Contoso", "Fabrikam", "Globex", "Initech", "Umbrella",
  "Soylent", "Vandelay", "Wonka", "Stark", "Wayne", "Cyberdyne",
  "Hooli", "Pied Piper", "Aperture", "BlueOrigin", "Tyrell", "Massive",
  "Bluth", "Prestige", "Sterling", "Dunder", "Vehement", "Gringotts",
  "Kruger", "Oceanic",
];
const COMPANY_SUFFIXES = [
  "Industries", "Group", "Labs", "Systems", "Holdings", "Partners",
  "Analytics", "Logistics", "Health", "Financial",
];

const NOTE_TEMPLATES = [
  "Renewal owner is on parental leave until Q3, escalate to the CS lead.",
  "Migrated from the legacy billing plan in the last cycle.",
  "Requested a mid-term seat expansion, pending procurement sign-off.",
  "Security review completed, SOC 2 report shared with their team.",
  "Historically slow to renew, start the conversation 60 days out.",
  "Downgraded from Enterprise after a reorganisation.",
  "Pilot team only, wider rollout under discussion.",
  "Invoices are settled by their parent company.",
  "Two failed payment attempts on the last invoice.",
  "Champion left the company, relationship needs rebuilding.",
];

/** Anchor for all generated dates, so status and renewal date agree (assumption A1). */
const TODAY = new Date();

function isoDateOffset(days: number): string {
  const date = new Date(
    Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth(), TODAY.getUTCDate()),
  );
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Renewal dates are derived from the status so the two never contradict.
 * Suspended accounts get any renewal date, since suspension is an admin
 * action independent of the date (assumption A1).
 */
function renewalOffsetFor(status: LicenseStatus): number {
  switch (status) {
    case "Active":
      return intBetween(EXPIRING_SOON_WINDOW_DAYS + 1, 365);
    case "Expiring Soon":
      return intBetween(1, EXPIRING_SOON_WINDOW_DAYS);
    case "Expired":
      return intBetween(-400, -1);
    case "Suspended":
      return intBetween(-180, 300);
  }
}

function seatsFor(plan: LicensePlan, index: number): { used: number; allowed: number } {
  const allowed =
    plan === "Trial" ? intBetween(3, 15)
    : plan === "Standard" ? intBetween(20, 120)
    : intBetween(150, 900);

  // Every 9th record is over-provisioned, e.g. after a downgrade (assumption A3).
  if (index % 9 === 0) {
    return { used: allowed + intBetween(1, 12), allowed };
  }
  return { used: intBetween(0, allowed), allowed };
}

const STATUS_WEIGHTS: LicenseStatus[] = [
  "Active", "Active", "Active", "Active", "Active",
  "Expiring Soon", "Expiring Soon", "Expiring Soon",
  "Expired", "Expired",
  "Suspended",
];

function generate(count: number): License[] {
  const usedNames = new Set<string>();
  const licenses: License[] = [];

  for (let index = 0; index < count; index += 1) {
    let customerName = "";
    do {
      customerName = `${pick(COMPANY_PREFIXES)} ${pick(COMPANY_SUFFIXES)}`;
    } while (usedNames.has(customerName));
    usedNames.add(customerName);

    const plan = pick(LICENSE_PLANS_LOCAL);
    const status = pick(STATUS_WEIGHTS);
    const { used, allowed } = seatsFor(plan, index);
    const slug = customerName.toLowerCase().replace(/[^a-z]+/g, "");

    licenses.push({
      id: `lic_${String(index + 1).padStart(3, "0")}`,
      customerName,
      plan,
      status,
      seatsUsed: used,
      seatsAllowed: allowed,
      renewalDate: isoDateOffset(renewalOffsetFor(status)),
      accountOwnerEmail: `${slug.slice(0, 14)}@example.com`,
      createdDate: isoDateOffset(-intBetween(400, 1600)),
      notes: pick(NOTE_TEMPLATES),
    });
  }

  return licenses;
}

const LICENSE_PLANS_LOCAL = ["Trial", "Standard", "Enterprise"] as const;

const banner = `// Generated by scripts/generate-fixtures.ts. Do not edit by hand.
// Regenerate with: bun run generate:fixtures
`;

const body = `import type { License } from "./types";

export const LICENSE_FIXTURES: License[] = ${JSON.stringify(generate(50), null, 2)};
`;

writeFileSync("src/lib/licenses/fixtures.ts", `${banner}\n${body}`);
console.log("Wrote 50 fixtures to src/lib/licenses/fixtures.ts");
```

- [ ] **Step 3: Add the script and generate**

Add to `package.json` scripts:

```json
"generate:fixtures": "bun run scripts/generate-fixtures.ts"
```

Run: `bun run generate:fixtures`
Expected: `Wrote 50 fixtures to src/lib/licenses/fixtures.ts`

- [ ] **Step 4: Verify the generated data holds its invariants**

Run: `bun run --eval 'const {LICENSE_FIXTURES:f}=await import("./src/lib/licenses/fixtures.ts"); console.log("count",f.length); console.log("statuses",[...new Set(f.map(l=>l.status))]); console.log("plans",[...new Set(f.map(l=>l.plan))]); console.log("over-provisioned",f.filter(l=>l.seatsUsed>l.seatsAllowed).length); console.log("unique names",new Set(f.map(l=>l.customerName)).size);'`

Expected: count 50, all four statuses present, all three plans present, over-provisioned count above 0, unique names 50.

- [ ] **Step 5: Typecheck and commit**

Run: `bunx tsc --noEmit`
Expected: no errors.

```bash
git add src/lib/licenses/types.ts src/lib/licenses/fixtures.ts scripts/generate-fixtures.ts package.json
git commit -m "feat: add license domain types and generated fixtures"
```

---

### Task 2: Pure filter, sort, and paginate logic

**Files:**
- Create: `src/lib/licenses/query.ts`
- Test: `src/lib/licenses/query.test.ts`

**Interfaces:**
- Consumes: `License`, `LicenseQuery`, `LicenseQueryResult`, `utilization`, `LICENSE_PLANS`, `LICENSE_STATUSES` from `./types`
- Produces: `queryLicenses(all: License[], query: LicenseQuery): LicenseQueryResult`, `DEFAULT_QUERY`, `PAGE_SIZES`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/licenses/query.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/lib/licenses/query.test.ts`
Expected: FAIL, cannot resolve `./query`.

- [ ] **Step 3: Implement the query module**

Create `src/lib/licenses/query.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/lib/licenses/query.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/licenses/query.ts src/lib/licenses/query.test.ts
git commit -m "feat: add pure filter, sort, and paginate logic with tests"
```

---

### Task 3: Seats validation

**Files:**
- Create: `src/lib/licenses/validation.ts`
- Test: `src/lib/licenses/validation.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `validateSeatsAllowed(raw: string, seatsUsed: number): SeatsValidation`, `MAX_SEATS_ALLOWED`, type `SeatsValidation`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/licenses/validation.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { MAX_SEATS_ALLOWED, validateSeatsAllowed } from "./validation";

describe("validateSeatsAllowed", () => {
  test("accepts a value above seats used", () => {
    expect(validateSeatsAllowed("25", 10)).toEqual({ ok: true, value: 25 });
  });

  test("accepts a value exactly equal to seats used", () => {
    expect(validateSeatsAllowed("10", 10)).toEqual({ ok: true, value: 10 });
  });

  test("accepts zero when no seats are in use", () => {
    expect(validateSeatsAllowed("0", 0)).toEqual({ ok: true, value: 0 });
  });

  test("trims surrounding whitespace", () => {
    expect(validateSeatsAllowed("  25  ", 10)).toEqual({ ok: true, value: 25 });
  });

  test("rejects an empty string", () => {
    const result = validateSeatsAllowed("", 10);
    expect(result.ok).toBe(false);
  });

  test("rejects whitespace only", () => {
    expect(validateSeatsAllowed("   ", 10).ok).toBe(false);
  });

  test("rejects non-numeric text", () => {
    expect(validateSeatsAllowed("abc", 10).ok).toBe(false);
  });

  test("rejects exponent notation", () => {
    expect(validateSeatsAllowed("1e3", 10).ok).toBe(false);
  });

  test("rejects a decimal", () => {
    expect(validateSeatsAllowed("12.5", 10).ok).toBe(false);
  });

  test("rejects a negative number", () => {
    const result = validateSeatsAllowed("-1", 0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/negative/i);
  });

  test("rejects a value below seats used, naming the figure", () => {
    const result = validateSeatsAllowed("5", 12);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("12");
  });

  test("rejects a value above the upper bound", () => {
    expect(validateSeatsAllowed(String(MAX_SEATS_ALLOWED + 1), 0).ok).toBe(false);
  });

  test("accepts a value exactly at the upper bound", () => {
    expect(validateSeatsAllowed(String(MAX_SEATS_ALLOWED), 0)).toEqual({
      ok: true,
      value: MAX_SEATS_ALLOWED,
    });
  });

  test("reports the negative message ahead of the below-seats-used message", () => {
    // -1 violates both rules. The more fundamental one should win.
    const result = validateSeatsAllowed("-1", 12);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/negative/i);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/lib/licenses/validation.test.ts`
Expected: FAIL, cannot resolve `./validation`.

- [ ] **Step 3: Implement the validator**

Create `src/lib/licenses/validation.ts`:

```ts
/** Upper bound on a seat allowance. Arbitrary, but a form needs one. */
export const MAX_SEATS_ALLOWED = 100_000;

export type SeatsValidation =
  | { ok: true; value: number }
  | { ok: false; error: string };

/**
 * Validates a raw seats-allowed input string against the current seats in use.
 * Checks run from most fundamental to most contextual, so the message a user
 * sees names the clearest reason the value is wrong.
 */
export function validateSeatsAllowed(raw: string, seatsUsed: number): SeatsValidation {
  const trimmed = raw.trim();

  if (trimmed === "") {
    return { ok: false, error: "Enter a number of seats." };
  }

  // Rejects decimals, exponent notation, and stray characters in one pass.
  if (!/^-?\d+$/.test(trimmed)) {
    return { ok: false, error: "Seats allowed must be a whole number." };
  }

  const value = Number(trimmed);

  if (!Number.isSafeInteger(value)) {
    return { ok: false, error: "Seats allowed must be a whole number." };
  }

  if (value < 0) {
    return { ok: false, error: "Seats allowed cannot be negative." };
  }

  if (value < seatsUsed) {
    return {
      ok: false,
      error: `Seats allowed cannot be below the ${seatsUsed} seats currently in use.`,
    };
  }

  if (value > MAX_SEATS_ALLOWED) {
    return {
      ok: false,
      error: `Seats allowed cannot exceed ${MAX_SEATS_ALLOWED.toLocaleString("en-GB")}.`,
    };
  }

  return { ok: true, value };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/lib/licenses/validation.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/licenses/validation.ts src/lib/licenses/validation.test.ts
git commit -m "feat: add seats allowed validation with tests"
```

---

### Task 4: In-memory store and Route Handlers

**Files:**
- Create: `src/lib/licenses/store.ts`
- Create: `src/app/api/licenses/route.ts`
- Create: `src/app/api/licenses/[id]/route.ts`

**Interfaces:**
- Consumes: `License` and `LICENSE_FIXTURES` from Task 1, `validateSeatsAllowed` from Task 3
- Produces: HTTP contract used by Task 6.
  - `GET /api/licenses` returns `200 { licenses: License[] }`, or `500 { error: string }` when `?fail=1`
  - `PATCH /api/licenses/:id` accepts `{ seatsAllowed: number }`, returns `200 { license: License }`, `400 { error }`, `404 { error }`, or `500 { error }` when `?fail=1`

- [ ] **Step 1: Read the Next.js 16 route handler docs before writing any handler**

Run: `ls node_modules/next/dist/docs/01-app/03-api-reference/02-file-conventions/`

Then read `route.mdx` from that directory. Confirm two things specifically, because both changed in recent versions and getting them wrong from memory is the most likely failure in this task:

1. The signature for dynamic segment params, specifically whether `params` is a Promise that must be awaited.
2. Whether any route segment config is needed to keep a handler dynamic when it reads query parameters.

Write the handlers to match what the bundled docs say, not what older App Router examples look like.

- [ ] **Step 2: Write the store**

Create `src/lib/licenses/store.ts`:

```ts
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
```

- [ ] **Step 3: Write the list route handler**

Create `src/app/api/licenses/route.ts`. Adjust the signature if Step 1's reading says otherwise:

```ts
import { getAllLicenses } from "@/lib/licenses/store";

/** Mock network latency, so the loading state is real rather than theoretical. */
const SIMULATED_LATENCY_MS = 400;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);

  // Lets the error state be exercised on demand (assumption A6).
  if (searchParams.get("fail") === "1") {
    return Response.json(
      { error: "Simulated upstream failure. Remove ?fail=1 to recover." },
      { status: 500 },
    );
  }

  await sleep(SIMULATED_LATENCY_MS);

  return Response.json({ licenses: getAllLicenses() });
}
```

- [ ] **Step 4: Write the update route handler**

Create `src/app/api/licenses/[id]/route.ts`:

```ts
import { setSeatsAllowed } from "@/lib/licenses/store";
import { findLicense } from "@/lib/licenses/store";
import { validateSeatsAllowed } from "@/lib/licenses/validation";

const SIMULATED_LATENCY_MS = 500;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);

  if (searchParams.get("fail") === "1") {
    return Response.json(
      { error: "Simulated save failure. Remove ?fail=1 to recover." },
      { status: 500 },
    );
  }

  const existing = findLicense(id);
  if (!existing) {
    return Response.json({ error: `No license with id ${id}.` }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const seatsAllowed =
    typeof body === "object" && body !== null && "seatsAllowed" in body
      ? (body as { seatsAllowed: unknown }).seatsAllowed
      : undefined;

  // Validate on the server too. The client cannot be the only gate.
  const validation = validateSeatsAllowed(String(seatsAllowed ?? ""), existing.seatsUsed);
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  await sleep(SIMULATED_LATENCY_MS);

  const updated = setSeatsAllowed(id, validation.value);
  if (!updated) {
    return Response.json({ error: `No license with id ${id}.` }, { status: 404 });
  }

  return Response.json({ license: updated });
}
```

- [ ] **Step 5: Verify both routes against the running dev server**

Run `bun run dev` in one shell, then in another:

```bash
curl -s localhost:3000/api/licenses | head -c 200
curl -s -o /dev/null -w '%{http_code}\n' 'localhost:3000/api/licenses?fail=1'
curl -s -X PATCH localhost:3000/api/licenses/lic_001 -H 'content-type: application/json' -d '{"seatsAllowed": 999}'
curl -s -X PATCH localhost:3000/api/licenses/lic_001 -H 'content-type: application/json' -d '{"seatsAllowed": -5}'
curl -s -o /dev/null -w '%{http_code}\n' -X PATCH localhost:3000/api/licenses/nope -H 'content-type: application/json' -d '{"seatsAllowed": 10}'
```

Expected, in order: a JSON payload of licenses; `500`; the updated license with `seatsAllowed: 999`; a 400 with the "cannot be negative" message; `404`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/licenses/store.ts src/app/api/licenses
git commit -m "feat: serve mock licenses from route handlers with forced-failure support"
```

---

### Task 5: URL search param state and debounce hooks

**Files:**
- Create: `src/hooks/use-debounced-value.ts`
- Create: `src/hooks/use-license-list-params.ts`

**Interfaces:**
- Consumes: `LicenseQuery`, `SortField`, `SortDirection`, `LICENSE_STATUSES`, `LICENSE_PLANS` from Task 1, `DEFAULT_QUERY` and `PAGE_SIZES` from Task 2
- Produces:
  - `useDebouncedValue<T>(value: T, delayMs: number): T`
  - `useLicenseListParams(): { query: LicenseQuery; setSearch(v: string): void; toggleStatus(s: LicenseStatus): void; togglePlan(p: LicensePlan): void; setSort(field: SortField): void; setPage(page: number): void; setPageSize(size: number): void; clearFilters(): void; hasActiveFilters: boolean }`

- [ ] **Step 1: Write the debounce hook**

Create `src/hooks/use-debounced-value.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

/**
 * Returns `value` delayed by `delayMs`, resetting the timer on every change.
 * Used to keep typing in the search box from re-filtering on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
```

- [ ] **Step 2: Write the URL params hook**

Create `src/hooks/use-license-list-params.ts`:

```ts
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

/** Narrows an arbitrary string list to the members of a known union. */
function keepKnown<T extends string>(values: string[], allowed: readonly T[]): T[] {
  return values.filter((value): value is T => (allowed as readonly string[]).includes(value));
}

function parsePositiveInt(raw: string | null, fallback: number): number {
  if (raw === null) return fallback;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Holds list state in the URL rather than component state (assumption A8), so
 * a filtered view is shareable, the back button works, and a refresh is lossless.
 */
export function useLicenseListParams() {
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
      if (next.pageSize !== DEFAULT_QUERY.pageSize) params.set(PARAM.pageSize, String(next.pageSize));
      commit(params);
    },
    [commit],
  );

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

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
    clearFilters: () => write({ ...DEFAULT_QUERY, sortField: query.sortField, sortDirection: query.sortDirection }),

    hasActiveFilters:
      query.search.trim() !== "" || query.statuses.length > 0 || query.plans.length > 0,
  };
}
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-debounced-value.ts src/hooks/use-license-list-params.ts
git commit -m "feat: hold list state in URL search params"
```

---

### Task 6: Data fetching hook

**Files:**
- Create: `src/hooks/use-licenses.ts`

**Interfaces:**
- Consumes: the HTTP contract from Task 4, `License` from Task 1
- Produces:
  - `type LicensesState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; licenses: License[] }`
  - `useLicenses(): { state: LicensesState; refetch(): void; applyUpdate(license: License): void }`
  - `saveSeatsAllowed(id: string, seatsAllowed: number, options?: { forceFailure?: boolean }): Promise<License>`

- [ ] **Step 1: Write the hook and the save function**

Create `src/hooks/use-licenses.ts`:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import type { License } from "@/lib/licenses/types";

export type LicensesState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; licenses: License[] };

/** Reads an { error } payload, falling back to a status-based message. */
async function readError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "error" in body) {
      const { error } = body as { error: unknown };
      if (typeof error === "string") return error;
    }
  } catch {
    // Body was not JSON. Fall through to the generic message.
  }
  return `Request failed with status ${response.status}.`;
}

export function useLicenses() {
  const [state, setState] = useState<LicensesState>({ status: "loading" });
  // Bumping this re-runs the effect, which is how retry works.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });

    async function load() {
      try {
        // Forward ?fail=1 from the page URL so the error state is reachable (assumption A6).
        const pageParams = new URLSearchParams(window.location.search);
        const suffix = pageParams.get("fail") === "1" ? "?fail=1" : "";

        const response = await fetch(`/api/licenses${suffix}`, { signal: controller.signal });
        if (!response.ok) {
          setState({ status: "error", message: await readError(response) });
          return;
        }

        const body = (await response.json()) as { licenses: License[] };
        setState({ status: "ready", licenses: body.licenses });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Could not load licenses.",
        });
      }
    }

    void load();
    return () => controller.abort();
  }, [attempt]);

  const refetch = useCallback(() => setAttempt((value) => value + 1), []);

  /** Replaces one row after a successful save, without refetching the list. */
  const applyUpdate = useCallback((updated: License) => {
    setState((current) =>
      current.status === "ready"
        ? {
            ...current,
            licenses: current.licenses.map((license) =>
              license.id === updated.id ? updated : license,
            ),
          }
        : current,
    );
  }, []);

  return { state, refetch, applyUpdate };
}

/**
 * Pessimistic save (assumption A7): resolves only once the server confirms,
 * and throws with the server's message so the form can surface it inline.
 */
export async function saveSeatsAllowed(
  id: string,
  seatsAllowed: number,
  options: { forceFailure?: boolean } = {},
): Promise<License> {
  const suffix = options.forceFailure ? "?fail=1" : "";
  const response = await fetch(`/api/licenses/${id}${suffix}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ seatsAllowed }),
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  const body = (await response.json()) as { license: License };
  return body.license;
}
```

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-licenses.ts
git commit -m "feat: add license fetching hook with loading and error states"
```

---

### Task 7: shadcn/ui setup, badges, and formatting

**Files:**
- Create: `src/lib/licenses/format.ts`
- Create: `src/components/licenses/status-badge.tsx`
- Create: `src/components/licenses/plan-badge.tsx`
- Modify: `components.json`, `src/app/globals.css`, `src/lib/utils.ts` (generated by shadcn init)

**Interfaces:**
- Consumes: `LicenseStatus`, `LicensePlan`, `License`, `utilization` from Task 1
- Produces: `formatDate(iso: string): string`, `formatUtilization(license: License): string`, `isOverProvisioned(license: License): boolean`, `<StatusBadge status />`, `<PlanBadge plan />`

- [ ] **Step 1: Initialise shadcn/ui and add the primitives**

Run:

```bash
bunx --bun shadcn@latest init -d
bunx --bun shadcn@latest add button input table badge sheet select skeleton checkbox label popover
```

Expected: `components.json` created, primitives written under `src/components/ui/`, `src/lib/utils.ts` created with the `cn` helper.

If a prompt appears, accept the defaults. The project already uses Tailwind 4 and the `@/*` alias, which is what the initialiser expects.

- [ ] **Step 2: Write the formatting helpers**

Create `src/lib/licenses/format.ts`:

```ts
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
```

- [ ] **Step 3: Write the badges**

Create `src/components/licenses/status-badge.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { LicenseStatus } from "@/lib/licenses/types";

/**
 * Colour carries meaning here, so each badge also keeps its text label rather
 * than relying on hue alone.
 */
const STATUS_STYLES: Record<LicenseStatus, string> = {
  Active:
    "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  "Expiring Soon":
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  Expired:
    "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
  Suspended:
    "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
};

export function StatusBadge({ status }: { status: LicenseStatus }) {
  return (
    <Badge variant="outline" className={cn("font-medium", STATUS_STYLES[status])}>
      {status}
    </Badge>
  );
}
```

Create `src/components/licenses/plan-badge.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { LicensePlan } from "@/lib/licenses/types";

const PLAN_STYLES: Record<LicensePlan, string> = {
  Trial: "border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400",
  Standard: "border-sky-300 text-sky-700 dark:border-sky-900 dark:text-sky-300",
  Enterprise: "border-violet-300 text-violet-700 dark:border-violet-900 dark:text-violet-300",
};

export function PlanBadge({ plan }: { plan: LicensePlan }) {
  return (
    <Badge variant="outline" className={cn("font-normal", PLAN_STYLES[plan])}>
      {plan}
    </Badge>
  );
}
```

- [ ] **Step 4: Verify the build still passes**

Run: `bun run build`
Expected: compiles successfully.

- [ ] **Step 5: Commit**

```bash
git add components.json src/components/ui src/lib/utils.ts src/lib/licenses/format.ts src/components/licenses
git commit -m "feat: add shadcn primitives, date formatting, and status badges"
```

---

### Task 8: State components and the table skeleton

**Files:**
- Create: `src/components/licenses/states.tsx`
- Create: `src/components/licenses/license-table-skeleton.tsx`

**Interfaces:**
- Consumes: shadcn `Button`, `Skeleton`, `Table` primitives from Task 7
- Produces: `<ErrorState message onRetry />`, `<EmptyState />`, `<NoResultsState onClearFilters />`, `<LicenseTableSkeleton rows />`

- [ ] **Step 1: Write the state components**

Create `src/components/licenses/states.tsx`:

```tsx
import { Button } from "@/components/ui/button";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
      {children}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Shell>
      <h2 className="text-base font-semibold">Could not load licenses</h2>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </Shell>
  );
}

/** The dataset itself is empty. There is nothing to clear, so no action is offered. */
export function EmptyState() {
  return (
    <Shell>
      <h2 className="text-base font-semibold">No licenses yet</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Customer license records will appear here once accounts are provisioned.
      </p>
    </Shell>
  );
}

/** Filters excluded everything. Distinct from EmptyState, and recoverable. */
export function NoResultsState({ onClearFilters }: { onClearFilters: () => void }) {
  return (
    <Shell>
      <h2 className="text-base font-semibold">No matching licenses</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        No records match the current search and filters. Try widening them.
      </p>
      <Button variant="outline" size="sm" onClick={onClearFilters}>
        Clear filters
      </Button>
    </Shell>
  );
}
```

- [ ] **Step 2: Write the skeleton**

Create `src/components/licenses/license-table-skeleton.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";

/**
 * Skeleton rows rather than a spinner, so the table does not jump in height
 * when the real data arrives.
 */
export function LicenseTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, index) => (
        <TableRow key={index}>
          <TableCell><Skeleton className="h-4 w-48" /></TableCell>
          <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
          <TableCell><Skeleton className="h-5 w-24 rounded-full" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}
```

- [ ] **Step 3: Typecheck and commit**

Run: `bunx tsc --noEmit`
Expected: no errors.

```bash
git add src/components/licenses/states.tsx src/components/licenses/license-table-skeleton.tsx
git commit -m "feat: add loading skeleton and empty, error, and no-results states"
```

---

### Task 9: Toolbar with debounced search and facet filters

**Files:**
- Create: `src/components/licenses/license-search-input.tsx`
- Create: `src/components/licenses/license-facet-filter.tsx`
- Create: `src/components/licenses/license-toolbar.tsx`

**Interfaces:**
- Consumes: `useDebouncedValue` from Task 5, shadcn `Input`, `Button`, `Popover`, `Checkbox`, `Label`, `Badge`
- Produces: `<LicenseToolbar query onSearchChange onToggleStatus onTogglePlan onClearFilters hasActiveFilters />`

- [ ] **Step 1: Write the debounced search input**

Create `src/components/licenses/license-search-input.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

const DEBOUNCE_MS = 250;

/**
 * Keeps the typed value in local state so the field stays responsive, and
 * reports it upward only once typing settles.
 */
export function LicenseSearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const debounced = useDebouncedValue(draft, DEBOUNCE_MS);
  const lastReported = useRef(value);

  useEffect(() => {
    if (debounced === lastReported.current) return;
    lastReported.current = debounced;
    onChange(debounced);
  }, [debounced, onChange]);

  // Re-sync when the URL changes from outside, e.g. the back button or clear filters.
  useEffect(() => {
    if (value === lastReported.current) return;
    lastReported.current = value;
    setDraft(value);
  }, [value]);

  return (
    <Input
      type="search"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      placeholder="Search customer name"
      aria-label="Search by customer name"
      className="w-full sm:w-72"
    />
  );
}
```

- [ ] **Step 2: Write the reusable facet filter**

Create `src/components/licenses/license-facet-filter.tsx`:

```tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** One multi-select facet. Selections within a facet are an OR (assumption in scope.md). */
export function LicenseFacetFilter<T extends string>({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: readonly T[];
  selected: readonly T[];
  onToggle: (value: T) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          {label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="rounded-sm px-1 font-normal">
              {selected.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        <div className="flex flex-col gap-1">
          {options.map((option) => {
            const id = `${label}-${option}`;
            return (
              <Label
                key={option}
                htmlFor={id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm font-normal hover:bg-accent"
              >
                <Checkbox
                  id={id}
                  checked={selected.includes(option)}
                  onCheckedChange={() => onToggle(option)}
                />
                {option}
              </Label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 3: Write the toolbar**

Create `src/components/licenses/license-toolbar.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { LicenseFacetFilter } from "./license-facet-filter";
import { LicenseSearchInput } from "./license-search-input";
import {
  LICENSE_PLANS,
  LICENSE_STATUSES,
  type LicensePlan,
  type LicenseQuery,
  type LicenseStatus,
} from "@/lib/licenses/types";

export function LicenseToolbar({
  query,
  hasActiveFilters,
  onSearchChange,
  onToggleStatus,
  onTogglePlan,
  onClearFilters,
}: {
  query: LicenseQuery;
  hasActiveFilters: boolean;
  onSearchChange: (value: string) => void;
  onToggleStatus: (status: LicenseStatus) => void;
  onTogglePlan: (plan: LicensePlan) => void;
  onClearFilters: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <LicenseSearchInput value={query.search} onChange={onSearchChange} />
      <LicenseFacetFilter
        label="Status"
        options={LICENSE_STATUSES}
        selected={query.statuses}
        onToggle={onToggleStatus}
      />
      <LicenseFacetFilter
        label="Plan"
        options={LICENSE_PLANS}
        selected={query.plans}
        onToggle={onTogglePlan}
      />
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={onClearFilters}>
          Clear
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck and commit**

Run: `bunx tsc --noEmit`
Expected: no errors.

```bash
git add src/components/licenses/license-search-input.tsx src/components/licenses/license-facet-filter.tsx src/components/licenses/license-toolbar.tsx
git commit -m "feat: add debounced search and multi-select facet filters"
```

---

### Task 10: The table and pagination

**Files:**
- Create: `src/components/licenses/license-table.tsx`
- Create: `src/components/licenses/license-pagination.tsx`

**Interfaces:**
- Consumes: `License`, `SortField`, `LicenseQueryResult`, badges from Task 7, `formatDate`, `formatUtilization`, `isOverProvisioned`, `PAGE_SIZES`
- Produces: `<LicenseTable rows sortField sortDirection onSort onRowClick isLoading />`, `<LicensePagination result pageSize onPageChange onPageSizeChange />`

- [ ] **Step 1: Write the table**

Create `src/components/licenses/license-table.tsx`:

```tsx
"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatDate, formatUtilization, isOverProvisioned } from "@/lib/licenses/format";
import type { License, SortDirection, SortField } from "@/lib/licenses/types";
import { LicenseTableSkeleton } from "./license-table-skeleton";
import { PlanBadge } from "./plan-badge";
import { StatusBadge } from "./status-badge";

const COLUMNS: { field: SortField; label: string; numeric?: boolean }[] = [
  { field: "customerName", label: "Customer" },
  { field: "plan", label: "Plan" },
  { field: "status", label: "Status" },
  { field: "utilization", label: "Seats used / allowed", numeric: true },
  { field: "renewalDate", label: "Renewal date" },
];

export function LicenseTable({
  rows,
  sortField,
  sortDirection,
  isLoading,
  onSort,
  onRowClick,
}: {
  rows: License[];
  sortField: SortField;
  sortDirection: SortDirection;
  isLoading: boolean;
  onSort: (field: SortField) => void;
  onRowClick: (license: License) => void;
}) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((column) => {
              const active = sortField === column.field;
              return (
                <TableHead key={column.field} className={cn(column.numeric && "text-right")}>
                  <button
                    type="button"
                    onClick={() => onSort(column.field)}
                    className="inline-flex items-center gap-1 font-medium hover:text-foreground"
                    // Tells screen readers which column is sorted and which way.
                    aria-sort={active ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                  >
                    {column.label}
                    <span aria-hidden className={cn("text-xs", !active && "opacity-30")}>
                      {active && sortDirection === "desc" ? "↓" : "↑"}
                    </span>
                  </button>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <LicenseTableSkeleton />
          ) : (
            rows.map((license) => (
              <TableRow
                key={license.id}
                // Rows are focusable and activate on Enter or Space, so the detail
                // view is reachable without a mouse.
                tabIndex={0}
                role="button"
                aria-label={`View details for ${license.customerName}`}
                onClick={() => onRowClick(license)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onRowClick(license);
                  }
                }}
                className="cursor-pointer focus-visible:outline-2 focus-visible:outline-offset--2 focus-visible:outline-ring"
              >
                <TableCell className="font-medium">{license.customerName}</TableCell>
                <TableCell><PlanBadge plan={license.plan} /></TableCell>
                <TableCell><StatusBadge status={license.status} /></TableCell>
                <TableCell className="text-right tabular-nums">
                  <span className={cn(isOverProvisioned(license) && "font-semibold text-red-600 dark:text-red-400")}>
                    {license.seatsUsed} / {license.seatsAllowed}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {formatUtilization(license)}
                  </span>
                </TableCell>
                <TableCell className="tabular-nums">{formatDate(license.renewalDate)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: Write pagination**

Create `src/components/licenses/license-pagination.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PAGE_SIZES } from "@/lib/licenses/query";
import type { LicenseQueryResult } from "@/lib/licenses/types";

export function LicensePagination({
  result,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  result: LicenseQueryResult;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Rows per page</span>
        <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
          <SelectTrigger className="h-8 w-[72px]" aria-label="Rows per page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          Page {result.page} of {result.pageCount}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(result.page - 1)}
          disabled={result.page <= 1}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(result.page + 1)}
          disabled={result.page >= result.pageCount}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck and commit**

Run: `bunx tsc --noEmit`
Expected: no errors.

```bash
git add src/components/licenses/license-table.tsx src/components/licenses/license-pagination.tsx
git commit -m "feat: add sortable table and pagination controls"
```

---

### Task 11: Detail drawer and the seats edit form

**Files:**
- Create: `src/components/licenses/seats-edit-form.tsx`
- Create: `src/components/licenses/license-detail-drawer.tsx`

**Interfaces:**
- Consumes: `validateSeatsAllowed` from Task 3, `saveSeatsAllowed` from Task 6, `formatDate` from Task 7, shadcn `Sheet`, `Input`, `Button`, `Label`
- Produces: `<SeatsEditForm license onSaved />`, `<LicenseDetailDrawer license open onOpenChange onSaved />`

- [ ] **Step 1: Write the seats form**

Create `src/components/licenses/seats-edit-form.tsx`:

```tsx
"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveSeatsAllowed } from "@/hooks/use-licenses";
import { validateSeatsAllowed } from "@/lib/licenses/validation";
import type { License } from "@/lib/licenses/types";

export function SeatsEditForm({
  license,
  onSaved,
}: {
  license: License;
  onSaved: (updated: License) => void;
}) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const [draft, setDraft] = useState(String(license.seatsAllowed));
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Reset when the drawer switches to a different record.
  useEffect(() => {
    setDraft(String(license.seatsAllowed));
    setSaveError(null);
  }, [license.id, license.seatsAllowed]);

  const validation = validateSeatsAllowed(draft, license.seatsUsed);
  const isUnchanged = validation.ok && validation.value === license.seatsAllowed;
  const validationError = validation.ok ? null : validation.error;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validation.ok || isSaving) return;

    setIsSaving(true);
    setSaveError(null);
    try {
      // Pessimistic: wait for the server before touching the row (assumption A7).
      const updated = await saveSeatsAllowed(license.id, validation.value);
      onSaved(updated);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setIsSaving(false);
    }
  }

  const message = validationError ?? saveError;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <Label htmlFor={inputId}>Seats allowed</Label>
      <div className="flex items-start gap-2">
        <div className="flex flex-col gap-1">
          <Input
            id={inputId}
            // Deliberately a text input: type="number" silently discards
            // invalid characters, which would hide the validation being tested.
            type="text"
            inputMode="numeric"
            value={draft}
            disabled={isSaving}
            onChange={(event) => setDraft(event.target.value)}
            aria-invalid={message !== null}
            aria-describedby={message ? errorId : undefined}
            className="w-32 tabular-nums"
          />
        </div>
        <Button type="submit" disabled={!validation.ok || isUnchanged || isSaving}>
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </div>

      {message && (
        <p id={errorId} role="alert" className="text-sm text-red-600 dark:text-red-400">
          {message}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {license.seatsUsed} seats currently in use.
      </p>
    </form>
  );
}
```

- [ ] **Step 2: Write the drawer**

Create `src/components/licenses/license-detail-drawer.tsx`:

```tsx
"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatDate, formatUtilization, isOverProvisioned } from "@/lib/licenses/format";
import type { License } from "@/lib/licenses/types";
import { PlanBadge } from "./plan-badge";
import { SeatsEditForm } from "./seats-edit-form";
import { StatusBadge } from "./status-badge";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b py-3 last:border-b-0">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/**
 * Right-hand drawer. shadcn's Sheet is built on Radix Dialog, which handles the
 * focus trap, Escape to close, and returning focus to the trigger.
 */
export function LicenseDetailDrawer({
  license,
  open,
  onOpenChange,
  onSaved,
}: {
  license: License | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (updated: License) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {license && (
          <>
            <SheetHeader>
              <SheetTitle>{license.customerName}</SheetTitle>
              <SheetDescription>License record {license.id}</SheetDescription>
            </SheetHeader>

            <div className="px-4">
              <dl>
                <Field label="Plan"><PlanBadge plan={license.plan} /></Field>
                <Field label="Status"><StatusBadge status={license.status} /></Field>
                <Field label="Seats">
                  <span className={isOverProvisioned(license) ? "text-red-600 dark:text-red-400" : undefined}>
                    {license.seatsUsed} of {license.seatsAllowed} used ({formatUtilization(license)})
                  </span>
                  {isOverProvisioned(license) && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                      This account is over its seat allowance.
                    </p>
                  )}
                </Field>
                <Field label="Renewal date">{formatDate(license.renewalDate)}</Field>

                {/* The three fields absent from the table. */}
                <Field label="Account owner">
                  <a href={`mailto:${license.accountOwnerEmail}`} className="underline underline-offset-2">
                    {license.accountOwnerEmail}
                  </a>
                </Field>
                <Field label="Created">{formatDate(license.createdDate)}</Field>
                <Field label="Notes">
                  {license.notes || <span className="text-muted-foreground">No notes.</span>}
                </Field>
              </dl>

              <div className="mt-6 border-t pt-6">
                <SeatsEditForm license={license} onSaved={onSaved} />
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 3: Typecheck and commit**

Run: `bunx tsc --noEmit`
Expected: no errors.

```bash
git add src/components/licenses/seats-edit-form.tsx src/components/licenses/license-detail-drawer.tsx
git commit -m "feat: add detail drawer with validated seats edit form"
```

---

### Task 12: Compose the page and verify every state

**Files:**
- Create: `src/components/licenses/license-page.tsx`
- Modify: `src/app/page.tsx` (replace the scaffold template entirely)
- Modify: `src/app/layout.tsx` (metadata only)

**Interfaces:**
- Consumes: every component and hook from Tasks 5 to 11
- Produces: the finished screen

- [ ] **Step 1: Write the client root**

Create `src/components/licenses/license-page.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { useLicenseListParams } from "@/hooks/use-license-list-params";
import { useLicenses } from "@/hooks/use-licenses";
import { queryLicenses } from "@/lib/licenses/query";
import type { License } from "@/lib/licenses/types";
import { LicenseDetailDrawer } from "./license-detail-drawer";
import { LicensePagination } from "./license-pagination";
import { LicenseTable } from "./license-table";
import { LicenseToolbar } from "./license-toolbar";
import { EmptyState, ErrorState, NoResultsState } from "./states";

export function LicensePage() {
  const { state, refetch, applyUpdate } = useLicenses();
  const params = useLicenseListParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const licenses = state.status === "ready" ? state.licenses : [];
  const result = useMemo(() => queryLicenses(licenses, params.query), [licenses, params.query]);

  // Read the selected row back out of the list so it reflects a saved edit.
  const selected = selectedId
    ? (licenses.find((license) => license.id === selectedId) ?? null)
    : null;

  function handleSaved(updated: License) {
    applyUpdate(updated);
  }

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">License usage</h1>
        <p className="text-sm text-muted-foreground">
          Customer license records across all accounts.
        </p>
      </header>

      {state.status === "error" ? (
        <ErrorState message={state.message} onRetry={refetch} />
      ) : (
        <>
          <LicenseToolbar
            query={params.query}
            hasActiveFilters={params.hasActiveFilters}
            onSearchChange={params.setSearch}
            onToggleStatus={params.toggleStatus}
            onTogglePlan={params.togglePlan}
            onClearFilters={params.clearFilters}
          />

          <p className="text-sm text-muted-foreground" aria-live="polite">
            {state.status === "loading"
              ? "Loading licenses..."
              : `Showing ${result.rows.length} of ${result.totalMatching} licenses`}
            {state.status === "ready" &&
              result.totalMatching !== result.totalOverall &&
              ` (filtered from ${result.totalOverall})`}
          </p>

          {/* Two distinct empty states: nothing at all, versus nothing matching. */}
          {state.status === "ready" && result.totalOverall === 0 ? (
            <EmptyState />
          ) : state.status === "ready" && result.totalMatching === 0 ? (
            <NoResultsState onClearFilters={params.clearFilters} />
          ) : (
            <>
              <LicenseTable
                rows={result.rows}
                sortField={params.query.sortField}
                sortDirection={params.query.sortDirection}
                isLoading={state.status === "loading"}
                onSort={params.setSort}
                onRowClick={(license) => setSelectedId(license.id)}
              />
              {state.status === "ready" && (
                <LicensePagination
                  result={result}
                  pageSize={params.query.pageSize}
                  onPageChange={params.setPage}
                  onPageSizeChange={params.setPageSize}
                />
              )}
            </>
          )}
        </>
      )}

      <LicenseDetailDrawer
        license={selected}
        open={selected !== null}
        onOpenChange={(open) => !open && setSelectedId(null)}
        onSaved={handleSaved}
      />
    </main>
  );
}
```

- [ ] **Step 2: Replace the page**

Replace the entire contents of `src/app/page.tsx`:

```tsx
import { Suspense } from "react";
import { LicensePage } from "@/components/licenses/license-page";

export default function Home() {
  return (
    // useSearchParams needs a Suspense boundary to avoid opting the whole
    // route into client-side rendering.
    <Suspense fallback={null}>
      <LicensePage />
    </Suspense>
  );
}
```

Update the `metadata` export in `src/app/layout.tsx`:

```ts
export const metadata: Metadata = {
  title: "License usage",
  description: "Internal admin view of customer license records.",
};
```

- [ ] **Step 3: Delete leftover scaffold assets**

Run: `rm -f public/next.svg public/vercel.svg public/file.svg public/globe.svg public/window.svg`

Then run `bun run build` and confirm nothing referenced them.

- [ ] **Step 4: Walk every state manually**

Start `bun run dev`, then check each in the browser:

| State | How to reach it | Expected |
| --- | --- | --- |
| Loading | Hard refresh `/` | Skeleton rows, no layout jump |
| Ready | Wait for load | 25 rows, sorted by renewal date ascending |
| Sort | Click each header twice | Ascending then descending, arrow follows |
| Search | Type a partial name | Filters after a pause, not per keystroke |
| Filters | Select two statuses and one plan | OR within a facet, AND across facets |
| No results | Search `zzzzz` | No-results state with a working Clear filters button |
| Pagination | Change page size, page forward | Counts update, buttons disable at each end |
| URL state | Copy the URL to a new tab | Same search, filters, sort, and page |
| Back button | Filter, then go back | Previous view restored |
| Detail | Click a row, and separately Tab to a row and press Enter | Drawer opens both ways |
| Focus trap | Tab inside the drawer, press Escape | Focus stays inside, Escape closes |
| Validation | Enter `-1`, `12.5`, `abc`, and a value below seats used | Inline error, Save disabled |
| Save | Enter a valid value, click Save | Button shows Saving, row updates on close |
| Save failure | Temporarily add `?fail=1` to the PATCH URL in `saveSeatsAllowed` | Inline error, input preserved |
| Fetch error | Load `/?fail=1` | Error state with a working Try again |

- [ ] **Step 5: Full verification gate**

Run each and confirm it passes:

```bash
bun test
bun run lint
bun run build
```

Expected: tests green, lint clean, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/app src/components/licenses/license-page.tsx public
git commit -m "feat: compose license usage page with all states wired up"
```

---

### Task 13: README

**Files:**
- Modify: `README.md` (replace the scaffold contents entirely)

- [ ] **Step 1: Write the README**

It must cover, at minimum:

- Setup and run instructions using Bun, including `bun install`, `bun run dev`, `bun test`
- How to trigger the error states, specifically `/?fail=1`
- What was prioritised given the time budget, and what another hour or two would go toward
- The architecture decisions and why: route handler over static import, URL state, plain hooks over React Query, pessimistic save
- The in-memory persistence caveat, stated plainly (assumption A9)
- Honest total time spent
- A pointer to `requirements/scope.md` and this plan

- [ ] **Step 2: Final verification and commit**

```bash
bun test && bun run lint && bun run build
git add README.md
git commit -m "docs: document setup, architecture decisions, and tradeoffs"
git push
```

---

## Self-Review

**Spec coverage.** Every requirement in `requirements/scope.md` maps to a task: the five columns and badges (Tasks 7, 10), debounced search (Task 9), status and plan filters (Task 9), sort by any column (Tasks 2, 10), pagination (Tasks 2, 10), detail drawer with three extra fields (Task 11), validated seats edit (Tasks 3, 11), loading (Task 8), error (Tasks 4, 8), both empty states (Tasks 8, 12), and tests (Tasks 2, 3).

**Assumption coverage.** A1 in Tasks 1 and 2, A2 in Tasks 1 and 2, A3 in Tasks 1, 7, and 10, A4 in Task 3, A5 in Task 2, A6 in Tasks 4 and 6, A7 in Tasks 6 and 11, A8 in Task 5, A9 in Task 4.

**Type consistency.** `License`, `LicenseQuery`, `LicenseQueryResult`, `SortField`, and `SortDirection` are defined once in Task 1 and imported everywhere after. `queryLicenses`, `validateSeatsAllowed`, `saveSeatsAllowed`, `useLicenses`, and `useLicenseListParams` keep the same signatures across every task that references them. `utilization` lives in `types.ts` and is consumed by both `query.ts` and `format.ts`.

**Known risk.** Task 4 writes route handlers whose exact signature depends on the installed Next.js version, which is why Step 1 of that task reads the bundled docs before any code is written rather than trusting the shape shown here.

---

## Execution Handoff

Plan complete and saved to `plans/2026-08-11-license-usage-admin.md`. Two execution options:

**1. Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
