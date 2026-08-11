# License Usage Admin

An internal admin screen listing customer license records, with search, filtering, sorting,
pagination, a detail drawer, and a validated seat-allowance edit.

Built with Next.js 16 (App Router), TypeScript, Tailwind CSS 4, and shadcn/ui.

---

## Running it

Requires [Bun](https://bun.sh) 1.3 or later and Node 20.9 or later, the floor Next.js 16 sets.

```bash
bun install
bun run dev
```

Then open http://localhost:3000.

| Command | What it does |
| --- | --- |
| `bun run dev` | Development server |
| `bun run build` | Production build |
| `bun run start` | Serve the production build |
| `bun run lint` | ESLint |
| `bun test` | Unit tests |
| `bun run generate:fixtures` | Regenerate the mock dataset |

### Exercising the loading and error states

A mock API that always succeeds leaves the error path unreachable, so failure is triggerable
on demand:

| State | How to reach it |
| --- | --- |
| Loading | Reload the page. The list route delays 400 ms deliberately. |
| Fetch error | Open [`/?fail=1`](http://localhost:3000/?fail=1). The list route returns a 500. |
| Empty, no data | Open [`/?empty=1`](http://localhost:3000/?empty=1). The list route returns no records. |
| Empty, no matches | Search for a string no customer matches. |
| Validation errors | In the drawer, enter `-1`, `12.5`, `abc`, or any value below the seats already in use. |
| Save failure | Open [`/?failSave=1`](http://localhost:3000/?failSave=1), then save a seat change. The list still loads. |

Each flag is forwarded from the page URL to the mock API, so `GET /api/licenses?fail=1`,
`GET /api/licenses?empty=1`, and `PATCH /api/licenses/:id?fail=1` produce the same responses
directly, if you would rather hit the API than the UI.

---

## How it is put together

```
src/
  app/
    api/licenses/route.ts        GET list
    api/licenses/[id]/route.ts   PATCH seats allowed
    page.tsx                     server shell
  components/licenses/           table, toolbar, drawer, badges, states
  hooks/                         URL params, debounce, data fetching
  lib/licenses/                  types, fixtures, store, query, validation, formatting
```

The layering is deliberate: everything in `lib/licenses/` is pure and framework-free, which is
what makes the filtering, sorting, and validation logic directly testable without rendering
anything.

### Decisions worth explaining

**Route Handlers rather than a static import.** The exercise allowed either. A static import
would have meant simulating the loading and error states, which are part of what needs
demonstrating. Serving the data over HTTP makes them real, and better reflects how a data layer
would actually be structured.

**Plain hooks rather than React Query or SWR.** One list fetch and one mutation do not justify a
cache layer. Writing the loading, error, and pending handling by hand keeps it visible rather
than delegated to a library, which is the point here.

**List state lives in the URL.** Search, filters, sort, and page are held in search params rather
than component state. Views become shareable, the back button works, and a refresh is lossless.
Pagination resets to page 1 whenever the result set narrows, so nobody lands on a page that no
longer exists.

**Saving is pessimistic.** The form waits for the server, stays disabled while in flight, and
surfaces failures inline without discarding input. An optimistic update would have hidden exactly
the state handling worth showing.

**The seats column sorts by utilisation** (used ÷ allowed) rather than by raw allowance, since
utilisation is what surfaces over- and under-provisioned accounts. Some fixture records
deliberately have more seats in use than allowed, as happens after a downgrade, and the table
flags them.

**Dates are formatted with a fixed locale in UTC.** Using the ambient locale renders differently
on the server and the client, which produces a hydration mismatch. That is a correctness fix, not
internationalisation support.

### Honest caveat about persistence

Writes mutate a module-level array behind the route handler. That resets when the server
restarts and is not safe across multiple workers. It is a mock, not a store, and nothing here
should be read as working persistence.

---

## Testing

Tests cover the pure logic, where the bugs that matter actually live:

- `src/lib/licenses/query.test.ts` covers search matching, facet combination (OR within a facet,
  AND across facets), every sort key including the utilisation edge case of a zero allowance,
  sort stability, and pagination clamping.
- `src/lib/licenses/validation.test.ts` covers the seat rules: empty, non-numeric, exponent
  notation, decimals, negatives, below seats in use, and the upper bound.

```bash
bun test
```

There are no component or end-to-end tests. See below.

---

## What was prioritised, and what is missing

Given the time budget, the priority was correct structure and complete state handling over
feature count: a clean separation between pure logic and presentation, real types throughout, and
every state reachable rather than only the happy path. The two empty states are kept distinct,
since "no licenses exist" and "your filters matched nothing" need different copy and different
actions.

With another hour or two:

1. **Component tests** for the drawer and the seats form, driving the validation rules through
   the actual DOM rather than only the validator.
2. **An end-to-end test** covering the filter, open, edit, save path.
3. **Keyboard and screen reader polish.** Rows are focusable and open the drawer on Enter, but
   they carry `role="button"`, which overrides the native `row` role and costs screen reader
   table navigation. Keeping it was the right call for now, since an activatable row that does
   not announce itself is the worse failure, but the proper fix is a real focusable control in
   the first cell, which preserves both. Result count changes after filtering should also be
   announced.
4. **A mobile layout.** It is desktop-first as an internal admin screen. It does not break on
   narrow screens, but it was not designed for them.
5. **Optimistic updates with rollback**, once the pessimistic path is proven.

Deliberately out of scope, with reasoning, in [`requirements/scope.md`](requirements/scope.md).

---

## Time spent

About two hours in total, inside the 2 to 3 hour budget.

Roughly half an hour of that went to scoping and writing the implementation plan before any code
was written, and the rest to the build itself. Front-loading the plan is what kept the layering
consistent and made the pure logic straightforward to test, so it is counted as work rather than
overhead.

---

## Project documents

- [`requirements/scope.md`](requirements/scope.md) covers what is being built, the assumptions
  taken where the requirements left room, and what was excluded on purpose.
- [`plans/`](plans) holds the task-by-task implementation plan the build follows.
