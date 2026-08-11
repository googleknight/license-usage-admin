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
  searchResetKey,
  onSearchChange,
  onToggleStatus,
  onTogglePlan,
  onClearFilters,
}: {
  query: LicenseQuery;
  hasActiveFilters: boolean;
  /** Bumped when filters are cleared, which remounts the search box. */
  searchResetKey: number;
  onSearchChange: (value: string) => void;
  onToggleStatus: (status: LicenseStatus) => void;
  onTogglePlan: (plan: LicensePlan) => void;
  onClearFilters: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <LicenseSearchInput
        key={searchResetKey}
        value={query.search}
        onChange={onSearchChange}
      />
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
