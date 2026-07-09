import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * AI health checks run in the browser against the user's endpoint.
 * This route exists only to document that — no keys, no env, no probe.
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      provider: "custom",
      baseUrl: "",
      error:
        "AI health is checked in the browser only. Open Settings and use Test connection.",
    },
    { status: 410 },
  );
}

export async function POST() {
  return GET();
}
