import fs from "node:fs/promises";
import path from "node:path";
import type { LessonContent, ProgressMap } from "@/lib/types";
import {
  appDataDir,
  lessonsCachePathFor,
  progressPath,
  type LessonCacheMode,
} from "@/lib/data/paths";

type LessonsCache = Record<string, LessonContent>;

type CacheSlot = {
  memory: LessonsCache | null;
  loadPromise: Promise<LessonsCache> | null;
  writeTimer: ReturnType<typeof setTimeout> | null;
  writePromise: Promise<void> | null;
  dirty: boolean;
};

const slots: Record<LessonCacheMode, CacheSlot> = {
  standard: {
    memory: null,
    loadPromise: null,
    writeTimer: null,
    writePromise: null,
    dirty: false,
  },
  personalized: {
    memory: null,
    loadPromise: null,
    writeTimer: null,
    writePromise: null,
    dirty: false,
  },
};

function normalizeMode(mode?: LessonCacheMode): LessonCacheMode {
  return mode === "personalized" ? "personalized" : "standard";
}

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(appDataDir(), { recursive: true });
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await ensureDataDir();
  const tmp = `${filePath}.${process.pid}.tmp`;
  // Compact JSON — much faster than pretty-print for large caches
  await fs.writeFile(tmp, JSON.stringify(data), "utf8");
  await fs.rename(tmp, filePath);
}

async function getLessonsMemory(
  mode: LessonCacheMode = "standard",
): Promise<LessonsCache> {
  const m = normalizeMode(mode);
  const slot = slots[m];
  if (slot.memory) return slot.memory;
  if (!slot.loadPromise) {
    const filePath = lessonsCachePathFor(m);
    slot.loadPromise = readJsonFile<LessonsCache>(filePath, {}).then(
      (cache) => {
        slot.memory = cache;
        return cache;
      },
    );
  }
  return slot.loadPromise;
}

async function flushLessonsCache(
  mode: LessonCacheMode = "standard",
): Promise<void> {
  const m = normalizeMode(mode);
  const slot = slots[m];
  if (!slot.dirty || !slot.memory) return;
  slot.dirty = false;
  const snapshot = slot.memory;
  slot.writePromise = writeJsonFile(
    lessonsCachePathFor(m),
    snapshot,
  ).finally(() => {
    slot.writePromise = null;
  });
  await slot.writePromise;
}

function scheduleLessonsFlush(mode: LessonCacheMode = "standard"): void {
  const m = normalizeMode(mode);
  const slot = slots[m];
  slot.dirty = true;
  if (slot.writeTimer) return;
  slot.writeTimer = setTimeout(() => {
    slot.writeTimer = null;
    void flushLessonsCache(m);
  }, 250);
}

export async function loadLessonsCache(
  mode: LessonCacheMode = "standard",
): Promise<LessonsCache> {
  return getLessonsMemory(mode);
}

export async function getCachedLesson(
  topicId: string,
  mode: LessonCacheMode = "standard",
): Promise<LessonContent | null> {
  const cache = await getLessonsMemory(mode);
  return cache[topicId] ?? null;
}

export async function saveCachedLesson(
  lesson: LessonContent,
  mode: LessonCacheMode = "standard",
): Promise<void> {
  const cache = await getLessonsMemory(mode);
  cache[lesson.topicId] = lesson;
  scheduleLessonsFlush(mode);
}

/** Persist any pending cache writes (call at end of batch jobs). */
export async function flushLessonCache(
  mode?: LessonCacheMode,
): Promise<void> {
  const modes: LessonCacheMode[] = mode
    ? [normalizeMode(mode)]
    : ["standard", "personalized"];
  for (const m of modes) {
    const slot = slots[m];
    if (slot.writeTimer) {
      clearTimeout(slot.writeTimer);
      slot.writeTimer = null;
    }
    if (slot.writePromise) await slot.writePromise;
    await flushLessonsCache(m);
  }
}

export async function listCachedLessonIds(
  mode: LessonCacheMode = "standard",
): Promise<Set<string>> {
  const cache = await getLessonsMemory(mode);
  return new Set(Object.keys(cache));
}

export async function loadProgress(): Promise<ProgressMap> {
  return readJsonFile<ProgressMap>(progressPath(), {});
}

export async function setProgressComplete(
  topicId: string,
  done: boolean,
): Promise<ProgressMap> {
  const progress = await loadProgress();
  if (done) {
    progress[topicId] = { completedAt: new Date().toISOString() };
  } else {
    delete progress[topicId];
  }
  await writeJsonFile(progressPath(), progress);
  return progress;
}

export async function cacheFileExists(
  mode: LessonCacheMode = "standard",
): Promise<boolean> {
  try {
    await fs.access(lessonsCachePathFor(mode));
    return true;
  } catch {
    return false;
  }
}

export function cacheDirHint(): string {
  return path.relative(process.cwd(), appDataDir()) || "data";
}
