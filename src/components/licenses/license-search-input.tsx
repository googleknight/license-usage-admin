"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

const DEBOUNCE_MS = 250;

/**
 * Keeps the typed value in local state so the field stays responsive, and
 * reports it upward only once typing settles.
 *
 * Clearing filters remounts this component rather than passing a new `value`,
 * because a draft that has not committed yet is invisible from the outside.
 */
export function LicenseSearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const debounced = useDebouncedValue(draft, DEBOUNCE_MS);
  const lastReported = useRef(value);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Reporting depends on the debounced value alone. Depending on `onChange` too
  // would re-run this whenever the parent re-created the callback, replaying a
  // stale debounced value over a search the URL has since cleared.
  useEffect(() => {
    if (debounced === lastReported.current) return;
    lastReported.current = debounced;
    onChangeRef.current(debounced);
  }, [debounced]);

  // Re-sync when the URL changes from outside, e.g. the back button.
  useEffect(() => {
    if (value === lastReported.current) return;
    lastReported.current = value;
    setDraft(value);
  }, [value]);

  return (
    <Input
      type="search"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      placeholder="Search customer name"
      aria-label="Search by customer name"
      className="w-full sm:w-72"
    />
  );
}
