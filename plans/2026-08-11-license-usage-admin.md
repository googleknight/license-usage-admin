# License Usage Admin Implementation Plan

> **Status: executed.** This is the plan the build followed, kept as the record of it. Task steps
> stay as checkboxes so what was done is legible, but the implementation source is no longer
> inlined here: the code in `src/` is the source of truth, and duplicating it in this file only
> produced drift. What remains is the reasoning, the framework findings that were expensive to
> learn, the deviations from the original plan, and the verification evidence.

**Goal:** Build a single Next.js App Router admin screen that lists customer license records with
search, filtering, sorting, pagination, a detail drawer, and a validated seats-allowed edit.

**Architecture:** Mock data is served by Route Handlers (`GET /api/licenses`,
`PATCH /api/licenses/[id]`) backed by a module-level array, so loading, error, and pending states
are real rather than simulated. Filtering, sorting, pagination, validation, and URL parsing are
pure functions over the fetched array, driven by state held in URL search params. `lib/licenses/`
holds those pure modules plus `api.ts`, the single browser-facing module wrapping the two `fetch`
calls. Hooks are thin wrappers over both. The page is a server component wrapping one client
component that owns fetch state.

**Tech Stack:** Next.js 16.3.0 (App Router), React 19.2.8, TypeScript 5.9 strict, Tailwind CSS 4,
shadcn/ui on Base UI, Bun 1.3 as package manager and test runner.

## Global Constraints

- **Runtime/package manager:** Bun. Every command is `bun ...`, never `npm` or `pnpm`.
- **Next.js version floor:** 16.3.0. This differs from older App Router conventions. **Read the
  relevant guide under `node_modules/next/dist/docs/` before writing framework code**, per the
  generated `AGENTS.md`. Do not write route handlers or async params from memory.
- **TypeScript:** `strict: true`. No `any`. No non-null assertions (`!`) on values that can
  genuinely be absent.
- **Styling:** Tailwind 4 + shadcn/ui only. No second styling system, no inline `<style>`, no
  CSS-in-JS.
- **No new runtime dependencies** beyond shadcn/ui primitives and their peers. No state library, no
  data-fetching library, no date library, no test framework (Bun has one built in). One
  devDependency was required: `@types/bun`, without which `bun:test` imports have no ambient types
  and `bunx tsc --noEmit` fails repo-wide.
- **Dataset size:** 50 fixture records.
- **"Expiring Soon" window:** 30 days.
- **Seats upper bound:** `100000`.
- **Search debounce:** 400 ms.
- **Dates:** stored as ISO `YYYY-MM-DD` strings, formatted with locale `en-GB` and
  `timeZone: 'UTC'`. Never `new Date().toLocaleDateString()` with no timezone, which causes a
  server/client hydration mismatch.
- **Writing rules:** no em dashes anywhere, including code comments and commit messages. Use
  commas, colons, parentheses, or separate sentences.
- **Commits:** no AI attribution. No `Co-Authored-By` trailer, no "Generated with" line.
- **Verification gate:** `bun test`, `bun run lint`, and `bun run build` must all pass before the
  final commit.

**Reference:** [`requirements/scope.md`](../requirements/scope.md) holds the assumptions (A1 to A9)
referenced throughout.

---

## Framework findings

The five things in this section cost real time to establish and are not recoverable by reading the
code that resulted from them. Everything else in this plan is either in the repo or in the README.

### Base UI, not Radix

The current shadcn CLI generates primitives built on **Base UI** (`@base-ui/react`). Anything
written from Radix muscle memory is wrong here.

**There is no `asChild`.** Base UI composes through a `render` prop instead, and children move onto
the outer element:

```tsx
// Radix idiom, does not work here:
<PopoverTrigger asChild><Button variant="outline">Status</Button></PopoverTrigger>

// Base UI idiom, and what the generated select.tsx and sheet.tsx already use:
<PopoverTrigger render={<Button variant="outline" />}>Status</PopoverTrigger>
```

| Primitive | What actually applies |
| --- | --- |
| `Select` | `value` and `onValueChange` both work on the root. `onValueChange` is typed `(value: string \| null, eventDetails)`, so **guard the null case**: `Number(null)` silently yields `0`. |
| `Checkbox` | `checked` and `onCheckedChange` both exist. The handler receives `(checked: boolean, eventDetails)`, so a zero- or one-arg handler is fine. Wrapping a `Checkbox` in its `Label` does not double-toggle: the root calls `preventDefault()` and re-dispatches to the hidden input. |
| `Sheet` | Wraps Base UI `Dialog`. `SheetContent` takes `side`, defaulting to `"right"`. `modal` defaults to true, so the focus trap, Escape to close, and focus restoration are all automatic and nothing needs to reimplement them. |
| `Popover` | `PopoverContent` accepts `align`, `alignOffset`, `side`, `sideOffset`. `PopoverTrigger` does **not** accept `asChild`, see above. |
| `SelectValue` | Does accept `placeholder`, and the shadcn wrapper passes it through. |
| `Button` | `type` defaults to `"button"` but caller props win in `mergeProps`, so `type="submit"` does fire form submission. |

### Two Tailwind 4 traps, both verified empirically

**`outline-none` silently kills an `outline-*` focus ring.** Tailwind 4's `outline-none` sets
`--tw-outline-style: none`, and `focus-visible:outline-2` emits
`outline-style: var(--tw-outline-style)`, so the outline resolves to `none` despite a 2px width.
The shadcn primitives pair `outline-none` with `ring-*`, not `outline-*`, which is why they get
away with it. Do not combine `outline-none` with an `outline-*` focus ring. This is why
`license-table.tsx` carries a comment warning against adding it back to the row.

**tailwind-merge does not dedupe across different variant prefixes.** `cn` is
`twMerge(clsx(...))`, so `sm:max-w-md` and `data-[side=right]:sm:max-w-sm` both survive the merge
and the winner falls to stylesheet source order, not class order. To override a prefixed class,
match its prefix exactly: `data-[side=right]:sm:max-w-md`. This is why the drawer's width classes
look redundant.

### React 19 `set-state-in-effect`

`react-hooks/set-state-in-effect` rejects a synchronous `setState` in an effect body as a cascading
render. It hit `use-licenses.ts` and `seats-edit-form.tsx`. Two working patterns, both now in use:

- **Reset in the event handler instead.** `refetch` sets `loading` then bumps the attempt counter,
  so the effect never needs to.
- **Remount with a `key`.** `<SeatsEditForm key={license.id} />` resets the draft on record change
  without an effect at all.

A `setState` guarded behind an early return does not trigger the rule, which is why the search
input's two-effect re-sync is fine as written.

### The Suspense fallback *is* the prerendered HTML

`LicensePage` reads list state via `useSearchParams`, which no static prerender can know. On a
static route that bails the subtree out to client rendering, and the production build fails
outright without a boundary.

The first attempt used `fallback={null}` and left the page frame inside the client root, on the
reasoning that the boundary only existed to satisfy the build. That reasoning was incomplete.
Inspecting `.next/server/app/index.html` showed the prerendered body empty apart from scripts and a
`BAILOUT_TO_CLIENT_SIDE_RENDERING` marker: no `<main>`, no heading. The fallback is the static
HTML, so `null` bought a blank first paint, and the loading skeleton inside `LicensePage` could not
cover it because it sat below the boundary that bailed out.

Fixed by lifting the frame and heading above the boundary in `app/page.tsx` and giving the fallback
real skeleton markup (`license-page-fallback.tsx`).

Pinning the column widths in `license-table-columns.ts` came out of the same check. Measured across
the boundary, headers moved up to 73px sideways on hydration, because auto table layout sized
columns from the skeleton cell widths. That jump was already present in the ordinary
loading-to-ready transition; it just had not been measured. The column list is now shared by the
real table and the fallback so the two cannot drift.

### Dark mode is inert

shadcn replaced the scaffold's `prefers-color-scheme` media query with a class-based
`@custom-variant dark (&:is(.dark *))`, and nothing adds a `dark` class to `<html>`. The `dark:`
variants throughout the badge and table components are harmless and would activate if a theme
toggle were added later. Not worth fixing: visual design is out of scope.

### Dependencies shadcn added

All primitive peers and within budget: `@base-ui/react`, `class-variance-authority`, `clsx`,
`tailwind-merge`, `lucide-react`, `tw-animate-css`, and `shadcn` itself (a genuine runtime
dependency, since `globals.css` now does `@import "shadcn/tailwind.css"`).

---

## File Structure

```
src/
  app/
    api/licenses/route.ts              GET list, supports ?fail=1 and ?empty=1
    api/licenses/[id]/route.ts         PATCH seats allowed, supports ?fail=1
    page.tsx                           server shell: frame, heading, Suspense boundary
    layout.tsx                         metadata only
  components/
    licenses/
      license-page.tsx                 client root: owns fetch state, composes everything
      license-page-fallback.tsx        static stand-in shipped in the prerendered HTML
      license-toolbar.tsx              search input + status/plan filters + clear
      license-search-input.tsx         debounced text input
      license-facet-filter.tsx         reusable multi-select popover for one facet
      license-table.tsx                table, sortable headers, row click
      license-table-columns.ts         column labels and pinned widths, shared with the fallback
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
    use-license-list-params.ts         thin wrapper over lib/licenses/params
    use-licenses.ts                    fetch state machine over lib/licenses/api
  lib/
    licenses/
      types.ts                         License, unions, query and result types
      fixtures.ts                      generated, 50 records
      store.ts                         module-level mutable array
      query.ts        + .test.ts       pure filter/sort/paginate
      validation.ts   + .test.ts       seats validator
      params.ts       + .test.ts       pure URL parse and serialise
      api.ts                           the two browser fetch calls
      format.ts                        date and utilisation formatting
scripts/
  generate-fixtures.ts                 deterministic fixture generator
```

Tests are colocated as `*.test.ts` beside the module under test, which is what `bun test`
discovers by default. Everything in `lib/licenses/` is pure and framework-free except `api.ts`,
which is the one module that touches `fetch` and the page URL.

---

## Tasks

Each task lists what it produced and how it deviated from the original plan. The code is in the
repo; the per-task commits are in `git log`.

### Task 1: Domain types and deterministic fixtures

- [x] Write `src/lib/licenses/types.ts`: the `License` interface, `LICENSE_PLANS` and
  `LICENSE_STATUSES` as `as const` arrays with unions derived from them, `SORT_FIELDS`,
  `LicenseQuery`, `LicenseQueryResult`, `EXPIRING_SOON_WINDOW_DAYS`, and `utilization()`.
- [x] Write `scripts/generate-fixtures.ts`. Seeded PRNG (mulberry32) so names, plans, and seat
  counts are byte-identical between runs for a given seed, which keeps the committed fixture file
  free of pointless diffs. Dates are deliberately *not* deterministic: they are anchored to the day
  the script runs, which is what keeps `status` and `renewalDate` in agreement.
- [x] Add the `generate:fixtures` package script and generate 50 records.
- [x] Verify the invariants hold: 50 records, unique ids and names, all four statuses and all three
  plans present, some over-provisioned (assumption A3).
- [x] Typecheck and commit.

**Design notes.** Unions derive from `as const` arrays rather than being written twice, which is
what lets `planRank`/`statusRank` sort by declaration order and gives the badge style maps
exhaustive `Record<LicenseStatus, string>` keys. `utilization()` guards a zero allowance
(assumption A2) rather than dividing by zero. The generator imports `EXPIRING_SOON_WINDOW_DAYS`
and `LICENSE_PLANS` from `types.ts` so the window cannot drift between the fixtures and the app.

**Staleness caveat.** Because `status` is a stored field and the dates are baked into
`fixtures.ts`, coherence decays over time: a record badged "Expiring Soon" will eventually sit past
its renewal date. Re-run `bun run generate:fixtures` if the fixtures are more than a few weeks old.

### Task 2: Pure filter, sort, and paginate logic

- [x] Write `query.test.ts` first, covering search matching, facet combination, every sort key,
  sort stability, input immutability, and pagination clamping.
- [x] Confirm the tests fail for the right reason.
- [x] Implement `query.ts`: `queryLicenses`, `DEFAULT_QUERY`, `PAGE_SIZES`.
- [x] Confirm the tests pass, then commit.

**Design notes.** Default sort is renewal date ascending, since soonest expiry is why an admin
opens this screen. Sorting falls back to `id` for equal keys so the order is deterministic. ISO
`YYYY-MM-DD` compares correctly as a string, so no `Date` parsing is needed. `queryLicenses`
assumes a positive `pageSize`, which the URL parser guarantees by only accepting `PAGE_SIZES`
members.

### Task 3: Seats validation

- [x] Write `validation.test.ts` first: boundaries at seats-used and at the upper bound, whitespace
  trimming, and rejection of empty, non-numeric, decimal, exponent, and negative input.
- [x] Confirm the tests fail, implement `validation.ts`, confirm they pass, commit.

**Design notes.** `SeatsValidation` is a discriminated union, so `value` is only reachable once `ok`
narrows. Checks run most fundamental first, so `-1` against 12 seats in use reports "cannot be
negative" rather than the less clear below-seats-used message. The regex `^-?\d+$` rejects
decimals, exponent notation, and stray characters in one pass.

### Task 4: In-memory store and Route Handlers

- [x] **Read the Next.js 16 route handler docs before writing any handler.** Specifically confirm
  whether `params` is a Promise that must be awaited, and whether any route segment config is
  needed to keep a handler dynamic when it reads query parameters. This was the task most likely to
  fail from stale memory.
- [x] Write `store.ts`: a module-level mutable array standing in for a database (assumption A9),
  handing out copies so callers cannot mutate it by reference.
- [x] Write `GET /api/licenses` with a 400 ms simulated latency, `?fail=1`, and `?empty=1`.
- [x] Write `PATCH /api/licenses/[id]` with a 500 ms latency, `?fail=1`, server-side validation
  reusing `validateSeatsAllowed`, and 400/404 paths.
- [x] Verify both routes with `curl` against the dev server: list, forced failure, successful
  update, rejected negative value, unknown id.
- [x] Commit.

**Design notes.** The signature uses `RouteContext<"/api/licenses/[id]">`, the globally available
generated helper that derives typed params from the route literal. Equivalent to writing
`{ params: Promise<{ id: string }> }` by hand, and version-correct for Next 16. Validation runs
server-side as well as client-side, because the client cannot be the only gate.

### Task 5: URL search param state

- [x] Write `use-debounced-value.ts`.
- [x] Write `use-license-list-params.ts`, holding search, facets, sort, page, and page size in the
  URL (assumption A8).
- [x] Typecheck and commit.
- [x] **Later (second review pass):** extract the parsing and serialising into the pure
  `lib/licenses/params.ts` and cover it with `params.test.ts`.

**Design notes.** Writes use `router.replace`, not `push`, so a debounced search does not stack a
history entry per keystroke. The trade-off is that the back button does not step through filter
changes; the doc comment says so explicitly, and the README claims only that views are shareable
and refresh is lossless. Serialising omits any value at its default to keep URLs short. Narrowing
the result set resets to page 1. `clearFilters` keeps sort and page size, which are display
preferences rather than filters.

### Task 6: Data fetching hook

- [x] Write `use-licenses.ts`: a `LicensesState` discriminated union over loading, error, and
  ready, plus `refetch` and `applyUpdate` for a single-row update after a save.
- [x] Typecheck and commit.
- [x] **Later (second review pass):** move the two `fetch` calls into `lib/licenses/api.ts`, so the
  hook wraps `fetchLicenses` and the non-hook `saveSeatsAllowed` no longer lives in `hooks/`.

**Design notes.** Retry works by bumping an attempt counter that the effect depends on, with the
reset to `loading` done in the `refetch` handler rather than the effect body (see the React 19
finding above). `applyUpdate` replaces one row rather than refetching the list.

### Task 7: shadcn/ui setup, badges, and formatting

- [x] `shadcn init`, then add `button input table badge sheet select skeleton checkbox label
  popover`. This is where the Base UI discovery in the findings section came from.
- [x] Write `format.ts`: `formatDate`, `formatUtilization`, `isOverProvisioned`.
- [x] Write `status-badge.tsx` and `plan-badge.tsx`, each keying an exhaustive
  `Record<Union, string>` of Tailwind classes.
- [x] Confirm the build still passes, then commit.

**Design notes.** Both badges keep their text label rather than relying on hue alone, since colour
carries meaning here. `formatDate` is built on one module-level `Intl.DateTimeFormat` with a fixed
locale and UTC, which is a hydration-correctness fix rather than i18n support.

### Task 8: State components and the table skeleton

- [x] Write `states.tsx`: `ErrorState` with a retry action, `EmptyState` for an empty dataset, and
  `NoResultsState` with a clear-filters action. The two empty states are deliberately distinct.
- [x] Write `license-table-skeleton.tsx`: skeleton rows rather than a spinner, so the table does
  not jump in height when data arrives.
- [x] Typecheck and commit.

**Client boundary note.** Neither file carries `"use client"`, and neither needs it: a module is
already in the client graph if a client component imports it, and `license-page.tsx` is the
boundary. Importing a client component from a server component is fine on its own, which
`license-page-fallback.tsx` demonstrates: it is a server component and it renders both
`LicenseTableSkeleton` and the `"use client"` table primitives, and it prerenders. What actually
stops `ErrorState` and `NoResultsState` from being used from a server component is their function
props (`onRetry`, `onClearFilters`), since functions cannot be serialised across the server to
client boundary. `EmptyState` and `LicenseTableSkeleton` take no function props, which is why the
fallback can render the skeleton directly.

### Task 9: Toolbar with debounced search and facet filters

- [x] Write `license-search-input.tsx`, keeping the typed value in local state so the field stays
  responsive and reporting upward only once typing settles.
- [x] Write `license-facet-filter.tsx`, one reusable generic multi-select facet.
- [x] Write `license-toolbar.tsx`.
- [x] Typecheck and commit.

**Design notes.** The facet filter is generic over its option union (`<T extends string>`) rather
than taking `string[]`, so status and plan share one component without widening either type.
Selections within a facet are an OR, and separate facets combine as an AND. The trigger uses Base
UI's `render` prop, not `asChild`.

### Task 10: The table and pagination

- [x] Write `license-table.tsx` with sortable headers and clickable rows.
- [x] Write `license-pagination.tsx` with page controls and a page-size select.
- [x] Extract `license-table-columns.ts` so the fallback shares the column definitions and pinned
  widths (see the prerender finding above).
- [x] Typecheck and commit.

**Accessibility decision, resolved: keep `role="button"` on the row.** The tradeoff is real.
`role="button"` overrides the native `row` role, so cells lose their grid context and screen reader
table navigation degrades. It was kept anyway because the row's whole purpose here is to be
activated: it opens the detail drawer, and that affordance needs to be announced and reachable by
keyboard. A row that is focusable and responds to Enter but reports itself as a plain `row` is the
worse failure, since the interaction becomes invisible to anyone not using a mouse. The better
long-term fix is a real focusable control in the first cell, which keeps both the grid semantics
and the affordance. That is a layout change, out of scope here, and recorded in the README as a
next step.

**Other notes.** `aria-sort` belongs on the `th`, not on the button inside it, because screen
readers read it off the header cell. The row's focus ring uses a negative outline offset so it is
drawn inside the row rather than being clipped by its neighbours. The page-size handler guards
`null` before `Number()`, per the `Select` note above.

### Task 11: Detail drawer and the seats edit form

- [x] Write `seats-edit-form.tsx`: the one write action, validated, pessimistic.
- [x] Write `license-detail-drawer.tsx`: the full record plus the three fields the table omits
  (account owner email, created date, notes).
- [x] Typecheck and commit.

**Design notes.** The seats draft is plain local state with no effect syncing it to the `license`
prop; the drawer resets it by remounting with `key={license.id}`. The input is deliberately
`type="text"` with `inputMode="numeric"`, because `type="number"` silently discards invalid
characters and would hide the validation being demonstrated. Save is disabled while invalid,
unchanged, or in flight. The focus trap, Escape to close, and focus restoration all come free from
Base UI's `Dialog` defaults.

### Task 12: Compose the page and verify every state

- [x] Write `license-page.tsx` as the client root owning fetch state, selection, and drawer open
  state.
- [x] Rewrite `app/page.tsx` as the server shell: frame, heading, and the Suspense boundary, with
  `license-page-fallback.tsx` as the fallback. See the prerender finding for why the frame sits
  above the boundary and why the fallback is not `null`.
- [x] Update the `layout.tsx` metadata.
- [x] Delete the leftover scaffold SVGs from `public/` and confirm nothing referenced them.
- [x] Walk every state manually (table below).
- [x] Run the full verification gate.
- [x] Commit.

**Design notes.** Drawer open state is tracked separately from the selected id, because the sheet
plays an exit transition and clearing the id on close would slide an empty panel out. The selected
record is read back out of the list rather than copied, so a saved edit is reflected while the
drawer is open. `EMPTY_LICENSES` is a module constant so the `useMemo` dependency stays
referentially stable across loading renders.

### Task 13: README

- [x] Write the README: setup and run instructions, the table of how to reach every state, the
  architecture decisions and why, the in-memory persistence caveat stated plainly (assumption A9),
  priorities and gaps, and honest time spent.
- [ ] **Final commit and push.** Not yet done. The working tree currently carries the second review
  pass (`params.ts`, `params.test.ts`, `api.ts`, the hook and comment changes) plus the README
  update, all uncommitted.

---

## Verification

### Manual state walk

Walked 2026-08-11 via headless Chromium against `bun run dev`, then re-run against the post-fix
tree (search remount, drawer open/selection split, deferred validation, `?empty=1`). 31/31 checks
passed on the re-run.

| State | How to reach it | Expected | Verified |
| --- | --- | --- | --- |
| Loading | Hard refresh `/` | Skeleton rows, no layout jump | Yes (loading copy under delayed GET; skeleton present in tree) |
| Prerender | Load `/` with JavaScript disabled | Frame, heading, and skeleton table present in the static HTML | Yes (header columns measured at 0px shift across hydration at 1280 and 1024) |
| Ready | Wait for load | 25 rows, sorted by renewal date ascending | Yes |
| Sort | Click each header twice | Ascending then descending, arrow follows | Yes (Customer column) |
| Search | Type a partial name | Filters after a pause, not per keystroke | Yes (`Northwind` -> 2 matches) |
| Filters | Select two statuses and one plan | OR within a facet, AND across facets | Yes (Active+Expired AND Trial -> 6) |
| No results | Search `zzzzz` | No-results state with a working Clear filters button | Yes |
| Pagination | Change page size, page forward | Counts update, buttons disable at each end | Yes |
| URL state | Copy the URL to a new tab | Same search, filters, sort, and page | Yes (deep link restore) |
| Detail | Click a row, and separately Tab to a row and press Enter | Drawer opens both ways | Yes (click and Enter) |
| Focus trap | Tab inside the drawer, press Escape | Focus stays inside, Escape closes | Yes (Escape; trap is Sheet/Dialog default) |
| Validation | Enter `-1`, `12.5`, `abc`, and a value below seats used | Inline error, Save disabled | Yes |
| Save | Enter a valid value, click Save | Button shows Saving, row updates | Yes |
| Save failure | Load `/?failSave=1`, then save a seat change | Inline error, input preserved | Yes |
| Fetch error | Load `/?fail=1` | Error state with a working Try again | Yes |
| Empty dataset | Load `/?empty=1` | Empty state with no clear-filters action | Yes |

The back button was dropped from this table deliberately. Writes use `router.replace`, so stepping
back through filter changes is not a behaviour this build has or claims.

### Gate

Last run against the current tree, with the second review pass applied:

```
bunx tsc --noEmit   clean
bun test            50 pass, 0 fail, 3 files
bun run lint        0 errors (1 warning, in the gitignored checklist runner)
bun run build       succeeds, / static, both API routes dynamic
```

---

## Post-build revisions

### First review pass

Defects the plan did not anticipate:

- **Search input reset (Task 9).** The planned debounce reported upward through an effect keyed on
  both the debounced value and the `onChange` prop. Since the parent recreates that callback on
  every render, a pending debounce could be replayed over a search the URL had already cleared. The
  callback now lives in a ref, and clearing filters remounts the input, because a draft that has
  not committed yet is invisible from outside the component.
- **Seats form validation (Task 11).** Validating the untouched draft flagged every
  over-provisioned account (assumption A3) the moment its drawer opened. Errors now appear only
  once the field has been edited. The submit guard and disabled button are unchanged, so nothing
  invalid can be saved.
- **Drawer open state (Task 11).** Deriving `open` from the selected id emptied the panel during
  the sheet's exit transition. Open state is now tracked separately from the selection.
- **Aborted fetches (Task 6).** Aborting rejects the fetch, but a response that had already settled
  could still overwrite a newer attempt. The `setState` calls now check the signal first.
- **PATCH payload (Task 4).** The handler coerced the body with `String()`, which accepted `[25]`
  as `25`. It now requires a number or a string before validating.
- **Demo flags (Tasks 4 and 6).** The planned `forceFailure` argument on `saveSeatsAllowed` was
  never passed by any caller, leaving the inline save-failure state unreachable, and the "no data at
  all" empty state had no trigger at all. Both are now page URL flags (`?failSave=1`, `?empty=1`)
  alongside the existing `?fail=1`, and are documented in the README.
- **Facet params (Task 5).** Repeated values in a hand-written URL counted twice in the filter
  badge. Parsing now deduplicates.

### Second review pass (external)

- **URL parsing extracted (Task 5).** `keepKnown`, `parsePositiveInt`, and the query
  parse/serialise logic moved out of `use-license-list-params.ts` into the pure
  `lib/licenses/params.ts`. They were the highest-value untested code, guarding exactly the inputs
  a reviewer probes by hand (`?status=Bogus`, `?size=999`, `?page=-1`, duplicate statuses).
  `params.test.ts` now covers them and round-trips a query through serialise and parse; the hook is
  a thin wrapper over the pure functions.
- **Data-access module (Tasks 6 and 11).** `saveSeatsAllowed` was a plain async function living in
  `hooks/use-licenses.ts`, which read wrong for a non-hook. It and the list fetch moved to
  `lib/licenses/api.ts`, the one browser-facing module; `useLicenses` now wraps `fetchLicenses`.
- **Comment accuracy (Tasks 5 and 9).** Two comments credited the back button as a reason for URL
  state and for the search re-sync effect. Writes use `router.replace`, so the back button does not
  step through filter changes. The comments now state what actually holds, and name the
  `replace`-over-`push` trade-off explicitly.
- **Debounce raised from 250 ms to 400 ms**, which suits a `replace`-per-commit write better.
- **Two behaviours documented rather than changed** (both now in the README): the pagination footer
  is hidden while loading, since there is no real page count to show yet; and an out-of-range page
  is clamped for display but not rewritten in the URL, so `?page=99` renders page 3 while the URL
  still says 99, avoiding a redirect on mount.

### Deliberately not acted on

- The list setters rebuild the URL from a `query` snapshot, which is stale for the duration of one
  client navigation. Rewriting them to mutate `URLSearchParams` key by key costs more readability
  than a race no user-paced interaction can reach.
- `queryLicenses` still assumes a positive `pageSize`, which the URL parser guarantees by only
  accepting `PAGE_SIZES` members.
- `role="button"` on table rows stays, for the reasons recorded under Task 10.

---

## Self-Review

**Spec coverage.** Every requirement in `requirements/scope.md` maps to a task: the five columns
and badges (Tasks 7, 10), debounced search (Task 9), status and plan filters (Task 9), sort by any
column (Tasks 2, 10), pagination (Tasks 2, 10), detail drawer with three extra fields (Task 11),
validated seats edit (Tasks 3, 11), loading (Task 8), error (Tasks 4, 8), both empty states
(Tasks 8, 12), and tests (Tasks 2, 3, 5).

**Assumption coverage.** A1 in Tasks 1 and 2, A2 in Tasks 1 and 2, A3 in Tasks 1, 7, and 10, A4 in
Task 3, A5 in Task 2, A6 in Tasks 4 and 6, A7 in Tasks 6 and 11, A8 in Task 5, A9 in Task 4.

**Type consistency.** `License`, `LicenseQuery`, `LicenseQueryResult`, `SortField`, and
`SortDirection` are defined once in `types.ts` and imported everywhere after. `utilization` lives
in `types.ts` and is consumed by both `query.ts` and `format.ts`. No `any` anywhere in `src/`.

**Layering.** `lib/licenses/` is pure and framework-free except `api.ts`. Hooks wrap those modules
and own React state. Components take typed props and hold no data-fetching logic. That is what
makes the query, validation, and URL parsing testable without rendering anything.

---

## Remaining

1. Commit and push the second review pass and the README update (Task 13, Step 2).
2. Component tests for the drawer and seats form, driving validation through the DOM.
3. An end-to-end test over the filter, open, edit, save path.
4. Accessibility: replace `role="button"` on rows with a focusable control in the first cell, and
   announce result counts.
5. Regenerate fixtures if they have gone stale relative to the review date.
