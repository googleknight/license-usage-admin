import { describe, expect, test } from "bun:test";
import { MAX_SEATS_ALLOWED, validateSeatsAllowed } from "./validation";

describe("validateSeatsAllowed", () => {
  test("accepts a value above seats used", () => {
    expect(validateSeatsAllowed("25", 10)).toEqual({ ok: true, value: 25 });
  });

  test("accepts a value exactly equal to seats used", () => {
    expect(validateSeatsAllowed("10", 10)).toEqual({ ok: true, value: 10 });
  });

  test("accepts zero when no seats are in use", () => {
    expect(validateSeatsAllowed("0", 0)).toEqual({ ok: true, value: 0 });
  });

  test("trims surrounding whitespace", () => {
    expect(validateSeatsAllowed("  25  ", 10)).toEqual({ ok: true, value: 25 });
  });

  test("rejects an empty string", () => {
    const result = validateSeatsAllowed("", 10);
    expect(result.ok).toBe(false);
  });

  test("rejects whitespace only", () => {
    expect(validateSeatsAllowed("   ", 10).ok).toBe(false);
  });

  test("rejects non-numeric text", () => {
    expect(validateSeatsAllowed("abc", 10).ok).toBe(false);
  });

  test("rejects exponent notation", () => {
    expect(validateSeatsAllowed("1e3", 10).ok).toBe(false);
  });

  test("rejects a decimal", () => {
    expect(validateSeatsAllowed("12.5", 10).ok).toBe(false);
  });

  test("rejects a negative number", () => {
    const result = validateSeatsAllowed("-1", 0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/negative/i);
  });

  test("rejects a value below seats used, naming the figure", () => {
    const result = validateSeatsAllowed("5", 12);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("12");
  });

  test("rejects a value above the upper bound", () => {
    expect(validateSeatsAllowed(String(MAX_SEATS_ALLOWED + 1), 0).ok).toBe(false);
  });

  test("accepts a value exactly at the upper bound", () => {
    expect(validateSeatsAllowed(String(MAX_SEATS_ALLOWED), 0)).toEqual({
      ok: true,
      value: MAX_SEATS_ALLOWED,
    });
  });

  test("reports the negative message ahead of the below-seats-used message", () => {
    // -1 violates both rules. The more fundamental one should win.
    const result = validateSeatsAllowed("-1", 12);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/negative/i);
  });
});
