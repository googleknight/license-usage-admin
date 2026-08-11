"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PAGE_SIZES } from "@/lib/licenses/query";
import type { LicenseQueryResult } from "@/lib/licenses/types";

export function LicensePagination({
  result,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  result: LicenseQueryResult;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Rows per page</span>
        <Select
          value={String(pageSize)}
          // Base UI hands the handler (value, eventDetails), and types the value
          // as nullable because a select can be cleared. Ignore the null case:
          // this one always has a value.
          onValueChange={(value) => {
            if (value !== null) onPageSizeChange(Number(value));
          }}
        >
          <SelectTrigger className="h-8 w-[72px]" aria-label="Rows per page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          Page {result.page} of {result.pageCount}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(result.page - 1)}
          disabled={result.page <= 1}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(result.page + 1)}
          disabled={result.page >= result.pageCount}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
