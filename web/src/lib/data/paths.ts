import path from "node:path";

/** Repo root (parent of web/) when cwd is web/ */
export function repoRoot(): string {
  return path.resolve(process.cwd(), "..");
}

export function taxonomyTopicsPath(): string {
  return path.join(repoRoot(), "data", "topics.json");
}

export function taxonomyDepsPath(): string {
  return path.join(repoRoot(), "data", "dependencies.json");
}

export function appDataDir(): string {
  return path.join(process.cwd(), "data");
}

/** Standard lessons shipped to GitHub Pages. */
export function lessonsCachePath(): string {
  return path.join(appDataDir(), "lessons-cache.json");
}

/** Local-only personalized lessons (name/pets/likes). Never shipped to Pages. */
export function lessonsPersonalizedCachePath(): string {
  return path.join(appDataDir(), "lessons-cache-personalized.json");
}

export type LessonCacheMode = "standard" | "personalized";

export function lessonsCachePathFor(
  mode: LessonCacheMode = "standard",
): string {
  return mode === "personalized"
    ? lessonsPersonalizedCachePath()
    : lessonsCachePath();
}

export function progressPath(): string {
  return path.join(appDataDir(), "progress.json");
}
