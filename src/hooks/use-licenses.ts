"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchLicenses } from "@/lib/licenses/api";
import type { License } from "@/lib/licenses/types";

export type LicensesState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; licenses: License[] };

export function useLicenses() {
  const [state, setState] = useState<LicensesState>({ status: "loading" });
  // Bumping this re-runs the effect, which is how retry works.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const licenses = await fetchLicenses(controller.signal);
        // A response that settled before the effect was torn down would
        // otherwise land after a newer attempt started.
        if (controller.signal.aborted) return;
        setState({ status: "ready", licenses });
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
