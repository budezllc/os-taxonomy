import type {
  Dependency,
  Edge,
  LessonContent,
  Topic,
  TopicFilter,
  TopicSummary,
} from "@/lib/types";
import { buildIndex, sortCurriculum, withStatus } from "@/lib/data/sort";
import { readProgress } from "@/lib/progress";
import { withBasePath, isStaticSite } from "@/lib/site";
import {
  readLessonCacheMode,
  type LessonCacheMode,
} from "@/lib/prefs";

type TopicsFile = { topics: Topic[] };
type DepsFile = { dependencies: Dependency[] };
type LessonsCache = Record<string, LessonContent>;

let topicsPromise: Promise<Topic[]> | null = null;
let depsPromise: Promise<Dependency[]> | null = null;
let indexPromise: Promise<ReturnType<typeof buildIndex>> | null = null;

const lessonsByMode: Partial<
  Record<LessonCacheMode, Promise<LessonsCache>>
> = {};

function activeMode(): LessonCacheMode {
  if (isStaticSite()) return "standard";
  return readLessonCacheMode();
}

function cacheUrl(mode: LessonCacheMode): string {
  return mode === "personalized"
    ? "/data/lessons-cache-personalized.json"
    : "/data/lessons-cache.json";
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(withBasePath(path));
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json() as Promise<T>;
}

export async function loadTopics(): Promise<Topic[]> {
  if (!topicsPromise) {
    topicsPromise = fetchJson<TopicsFile>("/data/topics.json").then(
      (f) => f.topics,
    );
  }
  return topicsPromise;
}

export async function loadDeps(): Promise<Dependency[]> {
  if (!depsPromise) {
    depsPromise = fetchJson<DepsFile>("/data/dependencies.json").then(
      (f) => f.dependencies,
    );
  }
  return depsPromise;
}

export async function loadLessonsCache(
  mode?: LessonCacheMode,
): Promise<LessonsCache> {
  const m = mode ?? activeMode();
  if (!lessonsByMode[m]) {
    lessonsByMode[m] = fetchJson<LessonsCache>(cacheUrl(m)).catch(() => ({}));
  }
  return lessonsByMode[m]!;
}

/** Drop in-memory lesson caches so the next read picks up a mode switch. */
export function invalidateLessonsCache(mode?: LessonCacheMode): void {
  if (mode) {
    delete lessonsByMode[mode];
    return;
  }
  delete lessonsByMode.standard;
  delete lessonsByMode.personalized;
}

async function getIndex() {
  if (!indexPromise) {
    indexPromise = Promise.all([loadTopics(), loadDeps()]).then(([topics, deps]) =>
      buildIndex(topics, deps),
    );
  }
  return indexPromise;
}

function matchesFilter(
  node: {
    subject: string;
    ageStart: number | null;
    ageEnd: number | null;
    name: string;
    domain: string | null;
  },
  filter?: TopicFilter,
): boolean {
  if (!filter) return true;
  if (filter.subject && node.subject !== filter.subject) return false;
  if (filter.ageStart != null || filter.ageEnd != null) {
    if (node.ageStart == null || node.ageEnd == null) return false;
    const fStart = filter.ageStart ?? 0;
    const fEnd = filter.ageEnd ?? 99;
    const mid = (node.ageStart + node.ageEnd) / 2;
    if (mid < fStart || mid > fEnd) return false;
  }
  if (filter.q) {
    const q = filter.q.toLowerCase();
    const hay = `${node.name} ${node.domain ?? ""} ${node.subject}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export async function listSubjects(): Promise<string[]> {
  const index = await getIndex();
  return [...new Set(index.map((n) => n.subject))].sort();
}

export async function listTopics(filter?: TopicFilter): Promise<{
  topics: TopicSummary[];
  subjects: string[];
  stats: {
    total: number;
    completed: number;
    ready: number;
    locked: number;
    withLesson: number;
  };
}> {
  const index = await getIndex();
  const subjects = [...new Set(index.map((n) => n.subject))].sort();
  const filtered = index.filter((n) => matchesFilter(n, filter));
  const sorted = sortCurriculum(filtered);
  const filterIds = new Set(sorted.map((n) => n.id));
  const progress = readProgress();
  const completed = new Set(Object.keys(progress));
  const lessons = await loadLessonsCache();
  const lessonIds = new Set(Object.keys(lessons));
  const topics = withStatus(sorted, completed, lessonIds, filterIds);
  return {
    topics,
    subjects,
    stats: {
      total: topics.length,
      completed: topics.filter((t) => t.status === "complete").length,
      ready: topics.filter((t) => t.status === "ready").length,
      locked: topics.filter((t) => t.status === "locked").length,
      withLesson: topics.filter((t) => t.hasLesson).length,
    },
  };
}

export async function getTopic(id: string): Promise<Topic | null> {
  const topics = await loadTopics();
  return topics.find((t) => t.id === id) ?? null;
}

export async function getPrerequisites(id: string): Promise<Edge[]> {
  const [deps, topics] = await Promise.all([loadDeps(), loadTopics()]);
  const byId = new Map(topics.map((t) => [t.id, t]));
  return deps
    .filter((d) => d.topicId === id)
    .map((d) => ({
      prerequisiteId: d.prerequisiteId,
      strength: d.strength,
      reason: d.reason,
      name: byId.get(d.prerequisiteId)?.name ?? undefined,
    }));
}

export async function getLesson(id: string): Promise<LessonContent | null> {
  const cache = await loadLessonsCache();
  return cache[id] ?? null;
}

/** After local generation caches a lesson, refresh in-memory cache for active mode. */
export function rememberLesson(lesson: LessonContent): void {
  const m = activeMode();
  const existing = lessonsByMode[m];
  if (!existing) {
    lessonsByMode[m] = Promise.resolve({ [lesson.topicId]: lesson });
    return;
  }
  void existing.then((cache) => {
    cache[lesson.topicId] = lesson;
  });
}
