"use client";

import { useCallback, useEffect, useState } from "react";
import type { License } from "@/lib/licenses/types";

export type LicensesState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; licenses: License[] };

/** Reads an { error } payload, falling back to a status-based message. */
async function readError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "error" in body) {
      const { error } = body as { error: unknown };
      if (typeof error === "string") return error;
    }
  } catch {
    // Body was not JSON. Fall through to the generic message.
  }
  return `Request failed with status ${response.status}.`;
}

/**
 * Reads a demo flag off the page URL. The mock API always succeeding would
 * leave the failure and empty paths unreachable from the UI (assumption A6).
 */
function pageFlag(name: string): boolean {
  return new URLSearchParams(window.location.search).get(name) === "1";
}

export function useLicenses() {
  const [state, setState] = useState<LicensesState>({ status: "loading" });
  // Bumping this re-runs the effect, which is how retry works.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const forwarded = new URLSearchParams();
        for (const flag of ["fail", "empty"]) {
          if (pageFlag(flag)) forwarded.set(flag, "1");
        }
        const forwardedQuery = forwarded.toString();
        const suffix = forwardedQuery ? `?${forwardedQuery}` : "";

        const response = await fetch(`/api/licenses${suffix}`, {
          signal: controller.signal,
        });

        // Aborting rejects the fetch itself, but a response that had already
        // settled would otherwise land after a newer attempt started.
        if (!response.ok) {
          const message = await readError(response);
          if (controller.signal.aborted) return;
          setState({ status: "error", message });
          return;
        }

        const body = (await response.json()) as { licenses: License[] };
        if (controller.signal.aborted) return;
        setState({ status: "ready", licenses: body.licenses });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message:
            error instanceof Error ? error.message : "Could not load licenses.",
        });
      }
    }

    void load();
    return () => controller.abort();
  }, [attempt]);

  /**
   * Resets to loading and bumps the attempt counter, which re-runs the effect.
   * The reset lives here rather than in the effect body: setting state
   * synchronously inside an effect triggers a cascading render, and an event
   * handler is the right place for it. The initial state is already loading,
   * so the first fetch needs no reset.
   */
  const refetch = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  /** Replaces one row after a successful save, without refetching the list. */
  const applyUpdate = useCallback((updated: License) => {
    setState((current) =>
      current.status === "ready"
        ? {
            ...current,
            licenses: current.licenses.map((license) =>
              license.id === updated.id ? updated : license,
            ),
          }
        : current,
    );
  }, []);

  return { state, refetch, applyUpdate };
}

/**
 * Pessimistic save (assumption A7): resolves only once the server confirms,
 * and throws with the server's message so the form can surface it inline.
 */
export async function saveSeatsAllowed(
  id: string,
  seatsAllowed: number,
): Promise<License> {
  // ?failSave=1 on the page makes the inline save-failure path reachable
  // without the list request failing too.
  const suffix = pageFlag("failSave") ? "?fail=1" : "";
  const response = await fetch(`/api/licenses/${id}${suffix}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ seatsAllowed }),
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  const body = (await response.json()) as { license: License };
  return body.license;
}
