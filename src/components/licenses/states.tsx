import { Button } from "@/components/ui/button";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
      {children}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Shell>
      <h2 className="text-base font-semibold">Could not load licenses</h2>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </Shell>
  );
}

/** The dataset itself is empty. There is nothing to clear, so no action is offered. */
export function EmptyState() {
  return (
    <Shell>
      <h2 className="text-base font-semibold">No licenses yet</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Customer license records will appear here once accounts are provisioned.
      </p>
    </Shell>
  );
}

/** Filters excluded everything. Distinct from EmptyState, and recoverable. */
export function NoResultsState({
  onClearFilters,
}: {
  onClearFilters: () => void;
}) {
  return (
    <Shell>
      <h2 className="text-base font-semibold">No matching licenses</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        No records match the current search and filters. Try widening them.
      </p>
      <Button variant="outline" size="sm" onClick={onClearFilters}>
        Clear filters
      </Button>
    </Shell>
  );
}
