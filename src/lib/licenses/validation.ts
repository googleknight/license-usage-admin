/** Upper bound on a seat allowance. Arbitrary, but a form needs one. */
export const MAX_SEATS_ALLOWED = 100_000;

export type SeatsValidation =
  | { ok: true; value: number }
  | { ok: false; error: string };

/**
 * Validates a raw seats-allowed input string against the current seats in use.
 * Checks run from most fundamental to most contextual, so the message a user
 * sees names the clearest reason the value is wrong.
 */
export function validateSeatsAllowed(raw: string, seatsUsed: number): SeatsValidation {
  const trimmed = raw.trim();

  if (trimmed === "") {
    return { ok: false, error: "Enter a number of seats." };
  }

  // Rejects decimals, exponent notation, and stray characters in one pass.
  if (!/^-?\d+$/.test(trimmed)) {
    return { ok: false, error: "Seats allowed must be a whole number." };
  }

  const value = Number(trimmed);

  if (!Number.isSafeInteger(value)) {
    return { ok: false, error: "Seats allowed must be a whole number." };
  }

  if (value < 0) {
    return { ok: false, error: "Seats allowed cannot be negative." };
  }

  if (value < seatsUsed) {
    return {
      ok: false,
      error: `Seats allowed cannot be below the ${seatsUsed} seats currently in use.`,
    };
  }

  if (value > MAX_SEATS_ALLOWED) {
    return {
      ok: false,
      error: `Seats allowed cannot exceed ${MAX_SEATS_ALLOWED.toLocaleString("en-GB")}.`,
    };
  }

  return { ok: true, value };
}
