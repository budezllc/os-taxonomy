import { NextRequest, NextResponse } from "next/server";
import { getDataProvider } from "@/lib/data/provider";
import type { LessonCacheMode } from "@/lib/data/paths";

export const runtime = "nodejs";

function parseCacheMode(raw: string | null): LessonCacheMode {
  return raw === "personalized" ? "personalized" : "standard";
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const subject = searchParams.get("subject") ?? undefined;
  const q = searchParams.get("q") ?? undefined;
  const ageStart = searchParams.get("ageStart");
  const ageEnd = searchParams.get("ageEnd");
  const mode = parseCacheMode(searchParams.get("cache"));

  const data = getDataProvider();
  const topics = await data.listTopics(
    {
      subject,
      q,
      ageStart: ageStart != null ? Number(ageStart) : undefined,
      ageEnd: ageEnd != null ? Number(ageEnd) : undefined,
    },
    mode,
  );

  const subjects = await data.listSubjects();
  const progress = await data.getProgress();
  const completed = Object.keys(progress).length;

  return NextResponse.json({
    topics,
    subjects,
    stats: {
      total: topics.length,
      completed: topics.filter((t) => t.status === "complete").length,
      ready: topics.filter((t) => t.status === "ready").length,
      locked: topics.filter((t) => t.status === "locked").length,
      withLesson: topics.filter((t) => t.hasLesson).length,
      progressTotal: completed,
    },
    cache: mode,
  });
}
