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

const EMPTY_LICENSES: License[] = [];

export function LicensePage() {
  const { state, refetch, applyUpdate } = useLicenses();
  const params = useLicenseListParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const licenses = state.status === "ready" ? state.licenses : EMPTY_LICENSES;
  const result = useMemo(
    () => queryLicenses(licenses, params.query),
    [licenses, params.query],
  );

  // Read the selected row back out of the list so it reflects a saved edit.
  const selected = selectedId
    ? (licenses.find((license) => license.id === selectedId) ?? null)
    : null;

  function handleSaved(updated: License) {
    applyUpdate(updated);
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-10">
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

          {/* Nothing loaded and nothing matching are separate states. */}
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
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        onSaved={handleSaved}
      />
    </main>
  );
}
