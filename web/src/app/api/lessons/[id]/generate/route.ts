import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { getDataProvider } from "@/lib/data/provider";
import { flushLessonCache } from "@/lib/data/store";
import { lessonsCachePathFor, type LessonCacheMode } from "@/lib/data/paths";
import { LessonContentSchema } from "@/lib/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function parseCacheMode(raw: unknown): LessonCacheMode {
  return raw === "personalized" ? "personalized" : "standard";
}

/** Keep public/data in sync so client JSON loads match disk after generate. */
async function syncPublicCache(mode: LessonCacheMode): Promise<void> {
  const src = lessonsCachePathFor(mode);
  const name =
    mode === "personalized"
      ? "lessons-cache-personalized.json"
      : "lessons-cache.json";
  const dest = path.join(process.cwd(), "public", "data", name);
  try {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
  } catch {
    // public sync is best-effort for local browsing
  }
}

/**
 * Cache a browser-generated lesson. AI keys never touch this route —
 * the client calls the LLM directly, then POSTs the result here.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    force?: boolean;
    lesson?: unknown;
    cache?: string;
  };
  const mode = parseCacheMode(body.cache);
  const data = getDataProvider();

  const existing = await data.getLesson(id, mode);
  if (existing && !body.force) {
    return NextResponse.json({ lesson: existing, cached: true, cache: mode });
  }

  if (!body.lesson) {
    return NextResponse.json(
      {
        error:
          "Lesson content required. Generate in the browser (Settings AI), then cache here.",
      },
      { status: 400 },
    );
  }

  const topic = await data.getTopic(id);
  if (!topic) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  try {
    const lesson = LessonContentSchema.parse({
      ...(body.lesson as object),
      topicId: id,
    });
    await data.saveLesson(lesson, mode);
    await flushLessonCache(mode);
    await syncPublicCache(mode);
    return NextResponse.json({ lesson, cached: false, cache: mode });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Invalid lesson payload",
      },
      { status: 400 },
    );
  }
}
