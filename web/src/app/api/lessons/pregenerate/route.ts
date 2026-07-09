import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Pregeneration runs in the browser with the visitor's AI settings.
 * This endpoint is retired so API keys are never posted to the server.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Pregenerate runs in the browser. Configure AI in Settings, then start the batch from the Pregenerate page.",
    },
    { status: 410 },
  );
}

export async function GET() {
  return NextResponse.json(
    { error: "Pregenerate jobs are client-side only." },
    { status: 410 },
  );
}
