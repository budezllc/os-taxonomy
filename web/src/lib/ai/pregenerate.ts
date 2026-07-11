import type { PregenerateJob, PregenerateRequest, Topic } from "@/lib/types";
import {
  generateLesson,
  generateLessonWithRetries,
} from "@/lib/ai/provider";
import {
  FALLBACK_RETRY_COUNT,
  isTaxonomyFallbackLesson,
} from "@/lib/ai/lesson-meta";
import {
  readAiConfig,
  readLearnerProfile,
  readLessonCacheMode,
} from "@/lib/prefs";
import { rememberLesson } from "@/lib/data/curriculum";

export type ClientPregenerateCallbacks = {
  onUpdate: (job: PregenerateJob) => void;
  signal?: AbortSignal;
};

function now() {
  return new Date().toISOString();
}

function newId() {
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Run pregeneration entirely in the browser.
 * API keys stay in localStorage; only finished lessons are POSTed to the cache API.
 */
export async function runClientPregenerate(
  req: PregenerateRequest,
  topicIds: string[],
  topicsById: Map<string, Topic>,
  callbacks: ClientPregenerateCallbacks,
): Promise<PregenerateJob> {
  const ai = readAiConfig();
  const job: PregenerateJob = {
    id: newId(),
    status: "running",
    total: topicIds.length,
    done: 0,
    failed: 0,
    errors: [],
    createdAt: now(),
    updatedAt: now(),
  };
  callbacks.onUpdate({ ...job });

  for (const topicId of topicIds) {
    if (callbacks.signal?.aborted) {
      job.status = "error";
      job.errors.push({ topicId: "*", message: "Cancelled" });
      job.updatedAt = now();
      callbacks.onUpdate({ ...job });
      return job;
    }

    job.currentTopicId = topicId;
    job.updatedAt = now();
    callbacks.onUpdate({ ...job });

    try {
      const topic = topicsById.get(topicId);
      if (!topic) throw new Error("Topic not found");
      const profile = readLearnerProfile();
      const cacheMode = readLessonCacheMode();
      const useProfile = cacheMode === "personalized";
      const aiOptions = {
        baseUrl: ai.baseUrl,
        apiKey: ai.apiKey,
        model: ai.model,
        childName: useProfile ? profile.childName : undefined,
        interests: useProfile ? profile.interests : undefined,
        pets: useProfile ? profile.pets : undefined,
      };

      let lesson;
      if (req.onlyTaxonomyFallback) {
        const { lesson: generated, attempts } = await generateLessonWithRetries(
          topic,
          aiOptions,
          FALLBACK_RETRY_COUNT,
        );
        lesson = generated;
        if (isTaxonomyFallbackLesson(lesson)) {
          throw new Error(
            `Still taxonomy fallback after ${attempts} attempt${attempts === 1 ? "" : "s"}`,
          );
        }
      } else {
        lesson = await generateLesson(topic, aiOptions);
      }

      const res = await fetch(`/api/lessons/${topicId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          force: req.force || req.onlyTaxonomyFallback,
          lesson,
          cache: cacheMode,
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error || "Failed to cache lesson");
      }
      const saved = (await res.json()) as { lesson?: typeof lesson };
      if (saved.lesson) rememberLesson(saved.lesson);
      job.done += 1;
    } catch (err) {
      job.failed += 1;
      job.errors.push({
        topicId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
    job.updatedAt = now();
    callbacks.onUpdate({ ...job });
  }

  job.status = "done";
  job.currentTopicId = undefined;
  job.updatedAt = now();
  callbacks.onUpdate({ ...job });
  return job;
}
