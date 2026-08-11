# Next.js standards we follow (and what we deliberately skip)

Working note, meant to fold into the README's "what I prioritized" section. Target is
Next.js 16 (App Router) + TypeScript, scoped to a 2-3 hour take-home. The point of this
file: show the 2026 App Router conventions were a choice, not an oversight. Where a
production best practice does not fit a client-driven admin table, we say so instead of
adopting it for its own sake.

## Setup baseline (from official `create-next-app`)

- Bootstrap with `create-next-app`, TypeScript + App Router + Tailwind + ESLint. This gives
  Vercel's own defaults: `tsconfig` with `strict: true`, ESLint flat config, `next/font`.
- Node 18.18+ (Next.js 16 requirement). Turbopack is the default dev bundler, no config needed.
- Keep `strict: true` in `tsconfig`, which `create-next-app` sets for us. Real types for the
  data model and props, no `any`.
- `noUncheckedIndexedAccess` is **not** enabled. `create-next-app` does not add it, and turning
  it on would force optional-handling on every array index across the query and fixture code for
  no real safety gain at this size. Called out here so its absence reads as a decision.

## Conventions we DO apply (they fit this app)

1. **Route Handler for data.** `app/api/licenses/route.ts` returns the mock dataset as JSON.
   Typed request/response, no `any`. This is the "real data-fetching layer" the brief asks to
   demonstrate, and it is what makes loading and error states genuine rather than simulated.
2. **`next/font`** for the one font, self-hosted at build time. No layout shift, no external
   font request.
3. **Typed `metadata` export** in the root layout (title, description). This is the App Router
   replacement for hand-managed `<head>`; cheap to do correctly.
4. **Skeleton rows for the loading state**, plus explicit empty and error UI in the table itself.
   Note that `loading.tsx` is deliberately *not* used: it covers server-side route segment
   loading, and this data is fetched client-side, so it would never fire for the fetch. Skeleton
   rows matching the table layout also stop the page jumping when data lands, which a spinner
   does not. The `Suspense` boundary in `page.tsx` exists for `useSearchParams`, which is a
   separate requirement: without it, a statically prerendered route fails the production build.
5. **Hydration-safe dates.** Store dates as ISO `YYYY-MM-DD`, format with a fixed locale and
   `timeZone: "UTC"`. Prevents the classic SSR/client date mismatch.
6. **Client/server boundary is explicit.** The interactive table is a Client Component
   (`"use client"`), and only that subtree. The page/layout stay server components. No server-only
   code leaks into the client bundle, no client hooks leak upward.
7. **List state in URL search params** (search, filters, sort, page), read with
   `useSearchParams` / `useRouter`. App Router native, shareable, back button works.
8. **Debounced search** (~250ms) so we do not rewrite the URL on every keystroke.

## Conventions we DELIBERATELY skip (production patterns that do not fit a 2-3h client table)

- **Server Actions for the seats edit.** The 2026 default is a Server Action with progressive
  enhancement. Here the brief says in-memory update only, and the edit lives inside a
  client-side drawer, so a Route Handler `PATCH` (or direct client state update) is simpler and
  matches the rest of the data layer. Noted as a tradeoff, not an omission.
- **React Server Components for data fetching.** The main surface is fully interactive
  (sort/filter/paginate on the client), so RSC data fetching buys nothing and would force the
  data back across the boundary anyway.
- **Partial Prerendering (PPR), streaming, `cache`/`revalidate` tuning.** These matter for
  content pages under load. This is a single internal admin screen with ~40-60 in-memory rows.
- **No React Query / SWR / Redux.** Plain hooks fit the scope. Adding a data-fetching or state
  library here is the "over-engineered" case the brief warns against.

## Known caveat to state honestly in the README

The Route Handler is backed by a module-level mutable array. It is not a real store: it resets
on reload and is not safe across workers. Fine for this exercise, but we say so rather than
imply persistence works.

## Docs source of truth

Use `context7` (Next.js 16 / React docs on demand) when confirming an API, rather than relying
on memory. No third-party "Next.js best practices" skill is installed: they push
Server-Action / RSC patterns this app deliberately does not use.
