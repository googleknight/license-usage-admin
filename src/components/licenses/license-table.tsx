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
import {
  formatDate,
  formatUtilization,
  isOverProvisioned,
} from "@/lib/licenses/format";
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
                <TableHead
                  key={column.field}
                  className={cn(column.numeric && "text-right")}
                  // aria-sort belongs on the header cell itself, not on the
                  // button inside it. Screen readers read it off the th.
                  aria-sort={
                    active
                      ? sortDirection === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    type="button"
                    onClick={() => onSort(column.field)}
                    className="inline-flex items-center gap-1 rounded-sm font-medium hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {column.label}
                    <span
                      aria-hidden
                      className={cn("text-xs", !active && "opacity-30")}
                    >
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
                // The offset is negative so the ring is drawn inside the row
                // rather than being clipped by the neighbouring rows. Do not add
                // `outline-none` here: it sets --tw-outline-style to none, which
                // the focus-visible outline then inherits, leaving no ring at all.
                className="cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <TableCell className="font-medium">
                  {license.customerName}
                </TableCell>
                <TableCell>
                  <PlanBadge plan={license.plan} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={license.status} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <span
                    className={cn(
                      isOverProvisioned(license) &&
                        "font-semibold text-red-600 dark:text-red-400",
                    )}
                  >
                    {license.seatsUsed} / {license.seatsAllowed}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {formatUtilization(license)}
                  </span>
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatDate(license.renewalDate)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
