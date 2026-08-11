"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

const DEBOUNCE_MS = 250;

/**
 * Keeps the typed value in local state so the field stays responsive, and
 * reports it upward only once typing settles.
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

  useEffect(() => {
    if (debounced === lastReported.current) return;
    lastReported.current = debounced;
    onChange(debounced);
  }, [debounced, onChange]);

  // Re-sync when the URL changes from outside, e.g. the back button or clear filters.
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
