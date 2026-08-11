import { Suspense } from "react";
import { LicensePage } from "@/components/licenses/license-page";
import { LicensePageFallback } from "@/components/licenses/license-page-fallback";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">License usage</h1>
        <p className="text-sm text-muted-foreground">
          Customer license records across all accounts.
        </p>
      </header>

      {/*
        LicensePage reads the list state from the URL via useSearchParams, which
        no static prerender can know. On a static route that bails the subtree
        out to client rendering, and the production build fails outright without
        a boundary here. The fallback is not a spinner for a network wait: it is
        the markup baked into the static HTML until hydration replaces it, so an
        empty one would mean a blank first paint. Keeping the frame and heading
        above the boundary lets them prerender.
      */}
      <Suspense fallback={<LicensePageFallback />}>
        <LicensePage />
      </Suspense>
    </main>
  );
}
