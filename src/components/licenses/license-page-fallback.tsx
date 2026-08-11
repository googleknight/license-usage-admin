import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { LICENSE_TABLE_COLUMNS } from "./license-table-columns";
import { LicenseTableSkeleton } from "./license-table-skeleton";

/**
 * Stands in for LicensePage in the prerendered HTML. The toolbar cannot be
 * rendered for real here, because its state comes from the URL and the URL is
 * not known at build time, so the controls are placeholders. Column headers are
 * real (minus the sort affordance) to keep the table from shifting on hydration.
 */
export function LicensePageFallback() {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-full rounded-lg sm:w-72" />
        <Skeleton className="h-8 w-20 rounded-lg" />
        <Skeleton className="h-8 w-20 rounded-lg" />
      </div>

      <p className="text-sm text-muted-foreground">Loading licenses...</p>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {LICENSE_TABLE_COLUMNS.map((column) => (
                <TableHead
                  key={column.field}
                  className={cn(
                    "font-medium",
                    column.width,
                    column.numeric && "text-right",
                  )}
                >
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            <LicenseTableSkeleton />
          </TableBody>
        </Table>
      </div>
    </>
  );
}
