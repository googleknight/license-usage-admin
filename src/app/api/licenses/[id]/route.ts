import { findLicense, setSeatsAllowed } from "@/lib/licenses/store";
import { validateSeatsAllowed } from "@/lib/licenses/validation";

const SIMULATED_LATENCY_MS = 500;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/licenses/[id]">,
): Promise<Response> {
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);

  if (searchParams.get("fail") === "1") {
    return Response.json(
      { error: "Simulated save failure. Remove ?fail=1 to recover." },
      { status: 500 },
    );
  }

  const existing = findLicense(id);
  if (!existing) {
    return Response.json({ error: `No license with id ${id}.` }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const seatsAllowed =
    typeof body === "object" && body !== null && "seatsAllowed" in body
      ? (body as { seatsAllowed: unknown }).seatsAllowed
      : undefined;

  // Validate on the server too. The client cannot be the only gate.
  const validation = validateSeatsAllowed(String(seatsAllowed ?? ""), existing.seatsUsed);
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  await sleep(SIMULATED_LATENCY_MS);

  const updated = setSeatsAllowed(id, validation.value);
  if (!updated) {
    return Response.json({ error: `No license with id ${id}.` }, { status: 404 });
  }

  return Response.json({ license: updated });
}
