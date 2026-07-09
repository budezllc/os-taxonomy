import { NextRequest, NextResponse } from "next/server";
import { getDataProvider } from "@/lib/data/provider";

export const runtime = "nodejs";

export async function GET() {
  const progress = await getDataProvider().getProgress();
  return NextResponse.json({ progress });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { topicId?: string; done?: boolean };
  if (!body.topicId || typeof body.done !== "boolean") {
    return NextResponse.json(
      { error: "topicId and done required" },
      { status: 400 },
    );
  }
  const progress = await getDataProvider().setComplete(body.topicId, body.done);
  return NextResponse.json({ progress });
}
