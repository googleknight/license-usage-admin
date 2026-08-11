# Scope: License Usage admin screen

This document records what is being built, the assumptions taken where the requirements left
room, and what is deliberately excluded. It is the reference the implementation plan in
[`plans/`](../plans) is derived from.

Written before implementation started, and kept honest afterwards: if something here turned out
wrong during the build, it gets corrected rather than quietly abandoned.

---

## 1. What we are building

A single internal admin screen listing customer license records, with enough interaction to
find, inspect, and lightly manage them.

### The table

Five columns, all sortable:

| Column               | Notes                                                                              |
| -------------------- | ---------------------------------------------------------------------------------- |
| Customer name        | Alphabetical sort                                                                  |
| Plan                 | `Trial` / `Standard` / `Enterprise`                                                |
| Status               | `Active` / `Expiring Soon` / `Expired` / `Suspended`, rendered as a coloured badge |
| Seats used / allowed | Displayed as `12 / 25`, **sorted by utilisation** (see assumption A2)              |
| Renewal date         | Sorted chronologically                                                             |

### Interactions

- **Search** by customer name, debounced at 250 ms, case-insensitive substring match
- **Filter** by status and plan, multi-select within each facet
- **Sort** by any column, single column at a time, ascending or descending
- **Paginate** client-side, page sizes of 10 / 25 / 50

### Row detail

Clicking a row opens a right-hand drawer showing the full record, including three fields absent
from the table: account owner email, created date, and free-text notes.

### The one write action

The drawer contains a form to edit **seats allowed**. It validates input, sends a `PATCH` to a
mock API, and updates the row in place on success. Validation rules are in assumption A4.

### States that must work

Not just the happy path:

- **Loading**: skeleton rows matching the table layout
- **Error**: fetch failure surfaces a retry affordance, and is triggerable on demand (A6)
- **Empty, no data**: the dataset itself is empty
- **Empty, no matches**: filters or search excluded everything, offered with a clear-filters action
- **Validation errors**: inline on the seats form, with save disabled while invalid
- **Save failure**: surfaced inline without losing the user's input

---

## 2. Assumptions

Where the requirements delegated a decision or left genuine ambiguity, this is what we chose and
why. One item (A1) was escalated rather than assumed.

### A1. Status is a stored field, with a 30-day "Expiring Soon" window

**Ambiguity:** `Active`, `Expiring Soon`, and `Expired` are all derivable from the renewal date,
but `Suspended` is an independent administrative action that no date can imply. So status could
reasonably be either a stored column or a computed one.

**This was asked rather than assumed**, because it is the only ambiguity that changes the shape
of the type. Pending an answer, we proceed with:

- `status` stored as a single union type on the record
- a 30-day window for `Expiring Soon`
- fixtures generated so status and renewal date agree with that window

**Why the window matters even though status is stored:** we generate the fixture data, so a
record badged `Expiring Soon` with a renewal date eight months out would look like a bug rather
than a decision.

**Known drift:** fixture dates are absolute and generated against a fixed anchor date. Left long
enough, records will drift out of agreement with their stored status. `bun run generate:fixtures`
regenerates them against the current date.

### A2. The seats column sorts by utilisation

**Ambiguity:** the column shows two numbers but sorting needs one key.

Sorting on utilisation (`seatsUsed / seatsAllowed`) is what surfaces over- and under-provisioned
accounts, which is the reason an admin scans this column at all. Sorting on the raw allowance
would mostly just sort by customer size.

Edge case: a record with `seatsAllowed === 0` would divide by zero. It sorts as utilisation `0`.

### A3. Over-provisioned accounts exist in the data

Some records have `seatsUsed > seatsAllowed`, as happens after a plan downgrade.

This is not invented. The requirement that seats allowed "cannot be set below seats used" only
makes sense if that state is reachable, so the data reflects it, and the table flags it visually.

### A4. Seats validation rules

The stated rules were "not negative" and "not below seats used". Extended to a complete set,
since a form needs to reject every bad input, not just two:

| Rule                       | Rejected example               |
| -------------------------- | ------------------------------ |
| Required                   | `""`                           |
| Numeric                    | `"abc"`, `"1e3"`               |
| Integer                    | `"12.5"`                       |
| Not negative               | `"-1"`                         |
| Not below seats used       | `"5"` when 12 seats are in use |
| Sane upper bound (100,000) | `"999999999"`                  |

Errors surface inline, and save stays disabled while the value is invalid.

### A5. Search covers customer name only

Not treated as ambiguous. The requirement names customer name specifically, so searching notes
or owner email would be scope the requirement did not ask for.

### A6. The error state is triggerable on demand

A mock API that always succeeds makes the error path unreachable, which means it is neither
testable nor visible to a reviewer.

Both routes accept a `?fail=1` parameter that forces a 500. Documented in the README so the
error and save-failure states can actually be exercised.

### A7. Saving is pessimistic, not optimistic

The form waits for the mock request, stays disabled while pending, and surfaces failures inline.

An optimistic update would hide the pending and error handling, which is precisely the behaviour
worth demonstrating here.

### A8. List state lives in the URL

Search, filters, sort, and page are held in URL search params rather than component state. This
makes views shareable, makes the back button behave, and survives a refresh.

Consequence: pagination resets to page 1 whenever search or filters change, so users cannot land
on an out-of-range page.

### A9. In-memory persistence, and what that costs

Writes mutate a module-level array behind the route handler. This resets on server restart and is
not safe across multiple workers. Acceptable for an exercise, but it is a mock, not a store, and
the README says so rather than implying otherwise.

---

## 3. Out of scope

Deliberately excluded. Each is a decision, not an oversight.

### Not built, because the requirements excluded it

- **A database or any real persistence.** Mock data only.
- **Authentication or authorisation.** No login, no roles, no per-user visibility.
- **External API calls.** All data is local.
- **Server-side pagination, filtering, or sorting.** The dataset is ~50 records; client-side is
  correct at this size and was explicitly permitted.
- **Visual design polish.** Clean and legible is the target. No custom design system, no bespoke
  illustration, no brand work.

### Not built, because it is not justified at this size

- **A state management library.** URL params plus local component state cover it. Redux, Zustand,
  or Jotai would all be ceremony here.
- **React Query or SWR.** One list fetch and one mutation do not need a cache layer. Plain hooks
  make the loading and error handling visible rather than delegated.
- **A generic, reusable `<DataTable>` abstraction.** There is exactly one table. Generalising for a
  hypothetical second one is speculative.
- **Virtualised rows.** Pagination caps the DOM at 50 rows.
- **Optimistic updates with rollback.** See assumption A7.

### Not built, because of the time budget

Worth doing, and named here so their absence reads as a choice:

- **Mobile layout.** Desktop-first, as an internal admin screen. It does not break on narrow
  screens, but it is not designed for them.
- **Exhaustive test coverage.** Tests cover the pure logic where the real bugs live: filtering,
  sorting, pagination, and seats validation. No component or end-to-end tests.
- **Bulk actions.** No multi-select, no bulk seat edits.
- **Column visibility, reordering, or resizing.**
- **CSV export.**
- **Multi-column sort.** One sort key at a time.
- **Undo on save.**
- **Full internationalisation.** Dates are formatted with a fixed locale in UTC, deliberately, to
  avoid a server/client hydration mismatch. That is correctness, not i18n support.

---

## 4. Definition of done

Re-verified 2026-08-11 against the post-fix tree with a headless browser walkthrough
(31/31 checks). Includes the search-clear remount, drawer open/selection split, deferred
validation until edit, and `?empty=1` empty-dataset path.

- [x] `bun test` passes
- [x] `bun run build` and `bun run lint` both clean
- [x] README explains setup, priorities, tradeoffs, and honest time spent
- [x] The page and both API routes respond, including the forced 500 on `?fail=1`
- [x] Table renders all columns, with status as a distinct badge
- [x] Search, filter, sort, and pagination all work and survive a refresh
- [x] Row click opens the drawer with the three extra fields
- [x] Seats allowed can be edited, validated, saved, and the row updates
- [x] Loading, error, both empty states, and validation errors all reachable

Browser checks that backed the interactive items above:

| Check | Result |
| --- | --- |
| Default view | 25 rows, renewal date ascending, status and plan badges present |
| Search | `Northwind` wrote `?q=` and filtered to 2 of 50 |
| Clear uncommitted draft | Mid-typing draft cleared by toolbar Clear via search remount |
| Filters | Active + Expired AND Trial produced 6 Trial rows only |
| Sort | Customer header toggled ascending then descending |
| Pagination | Page size 10, Next/Previous, `?size=` / `?page=` in the URL |
| URL / back | Deep link restored search and sort; back cleared a later search |
| Drawer | Click and Enter both open it; account owner, created, notes present; Escape closes without emptying the panel mid-exit |
| Validation | Untouched field shows no alert; `-1`, `12.5`, `abc`, and below seats-used each error with Save disabled |
| Save | Valid PATCH updates the drawer and the table row; intercepted 500 keeps the draft |
| Loading | "Loading licenses..." visible under a delayed GET |
| Fetch error | `/?fail=1` shows the error state with Try again |
| Empty states | No-matches offers Clear filters; `/?empty=1` shows "No licenses yet" without it |
