import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { LicenseStatus } from "@/lib/licenses/types";

/**
 * Colour carries meaning here, so each badge also keeps its text label rather
 * than relying on hue alone.
 */
const STATUS_STYLES: Record<LicenseStatus, string> = {
  Active:
    "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  "Expiring Soon":
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  Expired:
    "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
  Suspended:
    "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
};

export function StatusBadge({ status }: { status: LicenseStatus }) {
  return (
    <Badge variant="outline" className={cn("font-medium", STATUS_STYLES[status])}>
      {status}
    </Badge>
  );
}
