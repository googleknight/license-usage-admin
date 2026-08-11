"use client";

import type { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  formatDate,
  formatUtilization,
  isOverProvisioned,
} from "@/lib/licenses/format";
import type { License } from "@/lib/licenses/types";
import { PlanBadge } from "./plan-badge";
import { SeatsEditForm } from "./seats-edit-form";
import { StatusBadge } from "./status-badge";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b py-3 last:border-b-0">
      <dt className="text-xs tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/**
 * Right-hand drawer showing the full record, including the three fields the
 * table omits, plus the seats edit form.
 *
 * The Sheet primitive wraps Base UI's Dialog, which defaults to `modal: true`.
 * That mounts the popup inside a FloatingFocusManager, so the focus trap,
 * Escape to close, and returning focus to whatever was focused before opening
 * are all handled for us. Nothing here needs to reimplement them.
 *
 * Width note: SheetContent's own class list already carries
 * `data-[side=right]:w-3/4` and `data-[side=right]:sm:max-w-sm`. Overriding with
 * a bare `sm:max-w-md` would not win, because tailwind-merge treats a different
 * variant prefix as a different class and keeps both, leaving the winner up to
 * stylesheet order. Matching the prefix exactly lets tailwind-merge drop the
 * defaults, so these two classes are the only widths that survive.
 */
export function LicenseDetailDrawer({
  license,
  open,
  onOpenChange,
  onSaved,
}: {
  license: License | null;
  open: boolean;
  // Base UI calls this with (open, eventDetails). The second argument is unused
  // here, and a narrower handler is assignable, so callers only take the boolean.
  onOpenChange: (open: boolean) => void;
  onSaved: (updated: License) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md"
      >
        {license && (
          <>
            <SheetHeader>
              <SheetTitle>{license.customerName}</SheetTitle>
              <SheetDescription>License record {license.id}</SheetDescription>
            </SheetHeader>

            <div className="px-4 pb-6">
              <dl>
                <Field label="Plan">
                  <PlanBadge plan={license.plan} />
                </Field>
                <Field label="Status">
                  <StatusBadge status={license.status} />
                </Field>
                <Field label="Seats">
                  <span
                    className={
                      isOverProvisioned(license)
                        ? "text-red-600 dark:text-red-400"
                        : undefined
                    }
                  >
                    {license.seatsUsed} of {license.seatsAllowed} used (
                    {formatUtilization(license)})
                  </span>
                  {isOverProvisioned(license) && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                      This account is over its seat allowance.
                    </p>
                  )}
                </Field>
                <Field label="Renewal date">{formatDate(license.renewalDate)}</Field>

                {/* The three fields absent from the table. */}
                <Field label="Account owner">
                  <a
                    href={`mailto:${license.accountOwnerEmail}`}
                    className="underline underline-offset-2"
                  >
                    {license.accountOwnerEmail}
                  </a>
                </Field>
                <Field label="Created">{formatDate(license.createdDate)}</Field>
                <Field label="Notes">
                  {license.notes || (
                    <span className="text-muted-foreground">No notes.</span>
                  )}
                </Field>
              </dl>

              <div className="mt-6 border-t pt-6">
                {/*
                  Keying by id resets the seats draft when the drawer switches to
                  a different record, instead of syncing it in an effect.
                */}
                <SeatsEditForm key={license.id} license={license} onSaved={onSaved} />
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
