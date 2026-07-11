import type { LessonContent } from "@/lib/types";

export const TAXONOMY_FALLBACK_SUFFIX = "(taxonomy fallback)";

export function isTaxonomyFallbackLesson(
  lesson: LessonContent | null | undefined,
): boolean {
  return Boolean(lesson?.model?.includes(TAXONOMY_FALLBACK_SUFFIX));
}

/** Max extra attempts after the first when a result would be taxonomy fallback. */
export const FALLBACK_RETRY_COUNT = 3;
