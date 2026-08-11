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
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [searchResetKey, setSearchResetKey] = useState(0);

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

  // Clearing also has to drop a search draft that has not committed yet. The
  // input cannot detect that on its own when the URL held no search to begin
  // with, so it is remounted, the same way the drawer resets the seats form.
  function handleClearFilters() {
    params.clearFilters();
    setSearchResetKey((key) => key + 1);
  }

  function handleRowClick(license: License) {
    setSelectedId(license.id);
    setIsDetailOpen(true);
  }

  // The page frame and heading live in the Server Component above, so they can
  // be prerendered. Everything from here down depends on the URL, which is only
  // readable on the client. These are direct children of that frame's flex
  // column: Suspense and fragments emit no DOM, so the column gap still applies.
  return (
    <>
      {state.status === "error" ? (
        <ErrorState message={state.message} onRetry={refetch} />
      ) : (
        <>
          <LicenseToolbar
            query={params.query}
            hasActiveFilters={params.hasActiveFilters}
            searchResetKey={searchResetKey}
            onSearchChange={params.setSearch}
            onToggleStatus={params.toggleStatus}
            onTogglePlan={params.togglePlan}
            onClearFilters={handleClearFilters}
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
            <NoResultsState onClearFilters={handleClearFilters} />
          ) : (
            <>
              <LicenseTable
                rows={result.rows}
                sortField={params.query.sortField}
                sortDirection={params.query.sortDirection}
                isLoading={state.status === "loading"}
                onSort={params.setSort}
                onRowClick={handleRowClick}
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

      {/*
        Open state is tracked separately from the selection, because the sheet
        plays an exit transition. Clearing the id on close would slide an empty
        panel out. The record is still required, so a row that disappears from
        the list closes the drawer rather than emptying it.
      */}
      <LicenseDetailDrawer
        license={selected}
        open={isDetailOpen && selected !== null}
        onOpenChange={setIsDetailOpen}
        onSaved={handleSaved}
      />
    </>
  );
}
