import type { SortField } from "@/lib/licenses/types";

/**
 * Shared by the real table and by the prerendered fallback, so the placeholder
 * header cannot drift out of step with the sortable one.
 *
 * The widths are pinned because column sizing would otherwise be derived from
 * whatever the cells happen to hold, which makes columns jump sideways when
 * skeletons are replaced by real rows. They add up to 100%.
 */
export const LICENSE_TABLE_COLUMNS: {
  field: SortField;
  label: string;
  width: string;
  numeric?: boolean;
}[] = [
  { field: "customerName", label: "Customer", width: "w-[23%]" },
  { field: "plan", label: "Plan", width: "w-[14%]" },
  { field: "status", label: "Status", width: "w-[18%]" },
  {
    field: "utilization",
    label: "Seats used / allowed",
    width: "w-[26%]",
    numeric: true,
  },
  { field: "renewalDate", label: "Renewal date", width: "w-[19%]" },
];
