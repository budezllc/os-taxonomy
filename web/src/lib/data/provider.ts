import fs from "node:fs/promises";
import type {
  Topic,
  TopicFilter,
  TopicSummary,
  Edge,
  LessonContent,
  ProgressMap,
  Dependency,
} from "@/lib/types";
import {
  taxonomyTopicsPath,
  taxonomyDepsPath,
  type LessonCacheMode,
} from "@/lib/data/paths";
import { buildIndex, sortCurriculum, withStatus } from "@/lib/data/sort";
import {
  getCachedLesson,
  saveCachedLesson,
  listCachedLessonIds,
  loadProgress,
  setProgressComplete,
} from "@/lib/data/store";

// Re-export interface shape from types — keep provider contract here
export type { TopicFilter, TopicSummary, Edge, LessonContent, ProgressMap };

function normalizeMode(mode?: LessonCacheMode): LessonCacheMode {
  return mode === "personalized" ? "personalized" : "standard";
}

type TopicsFile = { topics: Topic[] };
type DepsFile = { dependencies: Dependency[] };

let topicsCache: Topic[] | null = null;
let depsCache: Dependency[] | null = null;
let indexBuilt: ReturnType<typeof buildIndex> | null = null;

async function loadTopics(): Promise<Topic[]> {
  if (topicsCache) return topicsCache;
  const raw = await fs.readFile(taxonomyTopicsPath(), "utf8");
  const parsed = JSON.parse(raw) as TopicsFile;
  topicsCache = parsed.topics;
  return topicsCache;
}

async function loadDeps(): Promise<Dependency[]> {
  if (depsCache) return depsCache;
  const raw = await fs.readFile(taxonomyDepsPath(), "utf8");
  const parsed = JSON.parse(raw) as DepsFile;
  depsCache = parsed.dependencies;
  return depsCache;
}

async function getIndex() {
  if (indexBuilt) return indexBuilt;
  const [topics, deps] = await Promise.all([loadTopics(), loadDeps()]);
  indexBuilt = buildIndex(topics, deps);
  return indexBuilt;
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
    // Topics without an age range are excluded when an age band is selected.
    if (node.ageStart == null || node.ageEnd == null) return false;
    const fStart = filter.ageStart ?? 0;
    const fEnd = filter.ageEnd ?? 99;
    // Match by topic midpoint so edge-only overlap (e.g. Ages 5–9 vs band 9–11)
    // does not pass the filter.
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

export class LocalJsonDataProvider {
  async listSubjects(): Promise<string[]> {
    const index = await getIndex();
    return [...new Set(index.map((n) => n.subject))].sort();
  }

  async listTopics(
    filter?: TopicFilter,
    mode: LessonCacheMode = "standard",
  ): Promise<TopicSummary[]> {
    const index = await getIndex();
    const filtered = index.filter((n) => matchesFilter(n, filter));
    const sorted = sortCurriculum(filtered);
    const filterIds = new Set(sorted.map((n) => n.id));
    const [progress, lessonIds] = await Promise.all([
      loadProgress(),
      listCachedLessonIds(normalizeMode(mode)),
    ]);
    const completed = new Set(Object.keys(progress));
    return withStatus(sorted, completed, lessonIds, filterIds);
  }

  async getTopic(id: string): Promise<Topic | null> {
    const topics = await loadTopics();
    return topics.find((t) => t.id === id) ?? null;
  }

  async getPrerequisites(id: string): Promise<Edge[]> {
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

  async getLesson(
    id: string,
    mode: LessonCacheMode = "standard",
  ): Promise<LessonContent | null> {
    return getCachedLesson(id, normalizeMode(mode));
  }

  async saveLesson(
    lesson: LessonContent,
    mode: LessonCacheMode = "standard",
  ): Promise<void> {
    await saveCachedLesson(lesson, normalizeMode(mode));
  }

  async getProgress(): Promise<ProgressMap> {
    return loadProgress();
  }

  async setComplete(id: string, done: boolean): Promise<ProgressMap> {
    return setProgressComplete(id, done);
  }

  async getNextTopicId(
    currentId: string,
    filter?: TopicFilter,
  ): Promise<string | null> {
    const list = await this.listTopics(filter);
    const idx = list.findIndex((t) => t.id === currentId);
    if (idx < 0) return null;
    for (let i = idx + 1; i < list.length; i++) {
      if (list[i].status !== "locked") return list[i].id;
    }
    return null;
  }
}

let provider: LocalJsonDataProvider | null = null;

export function getDataProvider(): LocalJsonDataProvider {
  if (!provider) provider = new LocalJsonDataProvider();
  return provider;
}

/** For tests / hot reload */
export function resetTaxonomyCache(): void {
  topicsCache = null;
  depsCache = null;
  indexBuilt = null;
}
