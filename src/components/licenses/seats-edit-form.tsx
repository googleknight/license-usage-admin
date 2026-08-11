"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveSeatsAllowed } from "@/hooks/use-licenses";
import { validateSeatsAllowed } from "@/lib/licenses/validation";
import type { License } from "@/lib/licenses/types";

/**
 * The one write action: change a customer's seat allowance.
 *
 * The draft is deliberately plain local state with no effect syncing it back to
 * the `license` prop. Callers reset it by remounting with a `key`, which is what
 * `LicenseDetailDrawer` does. Syncing in an effect would be a cascading render,
 * and React 19's `set-state-in-effect` rule rejects it.
 */
export function SeatsEditForm({
  license,
  onSaved,
}: {
  license: License;
  onSaved: (updated: License) => void;
}) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const [draft, setDraft] = useState(String(license.seatsAllowed));
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const validation = validateSeatsAllowed(draft, license.seatsUsed);
  const isUnchanged = validation.ok && validation.value === license.seatsAllowed;

  // Some accounts are already over their allowance (assumption A3), so an
  // untouched form can hold a value the rules reject. Flagging the field before
  // anything has been typed reads as a broken form rather than as guidance, and
  // the drawer already states the over-provisioning above. Save stays disabled
  // either way, so nothing invalid can be submitted while this is hidden.
  const isEdited = draft.trim() !== String(license.seatsAllowed);
  const validationError = validation.ok || !isEdited ? null : validation.error;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validation.ok || isSaving) return;

    setIsSaving(true);
    setSaveError(null);
    try {
      // Pessimistic: wait for the server before touching the row (assumption A7).
      const updated = await saveSeatsAllowed(license.id, validation.value);
      onSaved(updated);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setIsSaving(false);
    }
  }

  // A live validation error is the more actionable message, so it wins over a
  // stale failure from the previous attempt.
  const message = validationError ?? saveError;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <Label htmlFor={inputId}>Seats allowed</Label>

      <div className="flex items-start gap-2">
        <Input
          id={inputId}
          // Deliberately a text input. type="number" silently discards invalid
          // characters, which would hide the validation rather than exercise it.
          type="text"
          inputMode="numeric"
          value={draft}
          disabled={isSaving}
          onChange={(event) => setDraft(event.target.value)}
          aria-invalid={message !== null}
          aria-describedby={message ? errorId : undefined}
          className="w-32 tabular-nums"
        />
        <Button type="submit" disabled={!validation.ok || isUnchanged || isSaving}>
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </div>

      {message && (
        <p id={errorId} role="alert" className="text-sm text-red-600 dark:text-red-400">
          {message}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        {license.seatsUsed} seats currently in use.
      </p>
    </form>
  );
}
