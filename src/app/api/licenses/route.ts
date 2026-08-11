import { getAllLicenses } from "@/lib/licenses/store";

/** Mock network latency, so the loading state is real rather than theoretical. */
const SIMULATED_LATENCY_MS = 400;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);

  // Lets the error state be exercised on demand (assumption A6).
  if (searchParams.get("fail") === "1") {
    return Response.json(
      { error: "Simulated upstream failure. Remove ?fail=1 to recover." },
      { status: 500 },
    );
  }

  await sleep(SIMULATED_LATENCY_MS);

  return Response.json({ licenses: getAllLicenses() });
}
