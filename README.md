# License Usage Admin

An internal admin screen listing customer license records, with search, filtering, sorting,
pagination, a detail drawer, and a validated seat-allowance edit.

Next.js 16 (App Router), TypeScript, Tailwind CSS 4, shadcn/ui.

## Running it

Requires [Bun](https://bun.sh) 1.3+ and Node 20.9+, the floor Next.js 16 sets.

```bash
bun install
bun run dev   # http://localhost:3000
```

Also available: `bun run build`, `bun run start`, `bun run lint`, `bun test`,
`bun run generate:fixtures`.

### Reaching every state

A mock API that always succeeds leaves the error path unreachable, so failure is triggerable
on demand:

| State | How to reach it |
| --- | --- |
| Loading | Reload. The list route delays 400 ms deliberately. |
| Fetch error | [`/?fail=1`](http://localhost:3000/?fail=1) |
| Empty, no data | [`/?empty=1`](http://localhost:3000/?empty=1) |
| Empty, no matches | Search for a string no customer matches. |
| Validation errors | In the drawer, enter `-1`, `12.5`, `abc`, or a value below seats in use. |
| Save failure | [`/?failSave=1`](http://localhost:3000/?failSave=1), then save a seat change. |

Each flag is forwarded to the mock API, so `GET /api/licenses?fail=1` and
`PATCH /api/licenses/:id?fail=1` behave the same if you would rather hit the API directly.

## Structure

```
src/
  app/
    api/licenses/route.ts        GET list
    api/licenses/[id]/route.ts   PATCH seats allowed
    page.tsx                     server shell: page frame, heading, Suspense boundary
  components/licenses/           table, toolbar, drawer, badges, states, prerender fallback
  hooks/                         URL list state, debounce, data fetching
  lib/licenses/                  types, fixtures, store, query, validation, formatting, params, api
```

The data model, query, validation, formatting, and URL `params` parsing in `lib/licenses/` are
pure and framework-free, which is what makes them testable without rendering anything. `api.ts` is
the one browser-facing module (the two `fetch` calls); the hooks stay thin wrappers over it.

## Decisions

- **Route Handlers rather than a static import.** Either was allowed; serving over HTTP makes the
  loading and error states real instead of simulated.
- **Plain hooks rather than React Query.** One fetch and one mutation do not justify a cache
  layer, and hand-written pending/error handling is part of what needs showing.
- **List state lives in the URL.** Search, filters, sort, and page are search params, so views are
  shareable and refresh is lossless. Pagination resets to page 1 when the result set narrows.
- **The Suspense fallback is a real skeleton, not `null`.** `useSearchParams` cannot prerender, so
  the fallback is the markup that ships in the static HTML until hydration. Column widths are
  pinned in one shared place so the skeleton and the real rows line up.
- **Saving is pessimistic.** The form waits for the server, disables while in flight, and surfaces
  failures inline without discarding input.
- **The seats column sorts by utilisation** (used ÷ allowed), which is what surfaces over- and
  under-provisioned accounts. Some fixtures deliberately exceed their allowance, as happens after
  a downgrade.
- **Dates are formatted with a fixed locale in UTC**, to avoid a hydration mismatch. A correctness
  fix, not i18n support.

**Persistence is fake.** Writes mutate a module-level array behind the route handler, which resets
on restart and is not safe across workers. Nothing here should be read as working persistence.

## Testing

`bun test` covers the pure logic: `query.test.ts` for search matching, facet combination (OR
within a facet, AND across facets), every sort key including a zero allowance, sort stability, and
pagination clamping; `validation.test.ts` for the seat rules; `params.test.ts` for URL parsing,
which tolerates hand-edited params (`?status=Bogus`, `?size=999`, `?page=-1`, duplicate statuses)
and round-trips a query through serialise and parse. No component or end-to-end tests yet.

## Priorities and gaps

The priority was correct structure and complete state handling over feature count: pure logic
separated from presentation, real types throughout, and every state reachable. The two empty
states are kept distinct, since "no licenses exist" and "your filters matched nothing" need
different copy and different actions.

With another hour or two:

1. Component tests for the drawer and seats form, driving validation through the DOM.
2. An end-to-end test over the filter, open, edit, save path.
3. Accessibility polish. Rows are focusable and open on Enter, but `role="button"` overrides the
   native `row` role and costs screen reader table navigation. The proper fix is a focusable
   control in the first cell, which preserves both. Result counts should also be announced.
4. A mobile layout. Desktop-first as an internal admin screen; it does not break on narrow
   screens but was not designed for them.
5. Optimistic updates with rollback, once the pessimistic path is proven.

Two deliberate small behaviours worth naming rather than hiding:

- **The pagination footer is hidden while the list is loading** and appears with the rows. During
  loading there is no real page count to show, so a placeholder footer would only pop or report
  the wrong totals. The table rows themselves use a skeleton so their layout does not jump.
- **An out-of-range page is clamped for display but not rewritten in the URL.** `?page=99` on a
  three-page result renders page 3 and the footer reads "Page 3 of 3", while the URL still says
  99. This avoids a redirect on mount; the clamp lives in the pure `queryLicenses`.

## Time spent

About two and a half hours of active development, plus a further 30 to 45 minutes on review fixes
and keeping the docs in step with the code. Roughly half an hour of the build time went to scoping
and the implementation plan before any code, which is what kept the layering consistent.

That puts the total a little past the 2 to 3 hour budget. The overrun is all in the review pass:
extracting the URL parsing into a pure, tested module, moving the two `fetch` calls out of `hooks/`
into `lib/licenses/api.ts`, and correcting comments that had drifted from what the code actually
does.

See [`requirements/scope.md`](requirements/scope.md) for assumptions and deliberate exclusions,
and [`plans/`](plans) for the task-by-task plan the build followed, including the framework
findings and the deviations made along the way.
