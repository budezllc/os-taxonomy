import { NextRequest, NextResponse } from "next/server";
import { getDataProvider } from "@/lib/data/provider";
import type { LessonCacheMode } from "@/lib/data/paths";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function parseCacheMode(raw: string | null): LessonCacheMode {
  return raw === "personalized" ? "personalized" : "standard";
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const mode = parseCacheMode(req.nextUrl.searchParams.get("cache"));
  const lesson = await getDataProvider().getLesson(id, mode);
  if (!lesson) {
    return NextResponse.json({ lesson: null, cache: mode });
  }
  return NextResponse.json({ lesson, cache: mode });
}
