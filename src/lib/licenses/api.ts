import type { License } from "./types";

/**
 * The browser-facing data-access layer: the two calls the UI makes against the
 * mock route handlers. Kept out of `hooks/` because these are plain async
 * functions, not React hooks, and out of the pure modules because they touch
 * `fetch` and the page URL.
 */

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

/**
 * Fetches the license list, forwarding the `fail`/`empty` demo flags to the
 * route handler. Throws with the server's message on a non-OK response so the
 * caller can surface it. Takes the caller's AbortSignal so an unmount cancels.
 */
export async function fetchLicenses(signal: AbortSignal): Promise<License[]> {
  const forwarded = new URLSearchParams();
  for (const flag of ["fail", "empty"]) {
    if (pageFlag(flag)) forwarded.set(flag, "1");
  }
  const forwardedQuery = forwarded.toString();
  const suffix = forwardedQuery ? `?${forwardedQuery}` : "";

  const response = await fetch(`/api/licenses${suffix}`, { signal });
  if (!response.ok) {
    throw new Error(await readError(response));
  }

  const body = (await response.json()) as { licenses: License[] };
  return body.licenses;
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
