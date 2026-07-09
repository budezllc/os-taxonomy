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
  const data = getDataProvider();
  const topic = await data.getTopic(id);
  if (!topic) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }
  const [prerequisites, lesson, progress] = await Promise.all([
    data.getPrerequisites(id),
    data.getLesson(id, mode),
    data.getProgress(),
  ]);

  return NextResponse.json({
    topic,
    prerequisites,
    lesson,
    complete: Boolean(progress[id]),
    cache: mode,
  });
}
