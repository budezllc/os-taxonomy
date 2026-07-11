"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PregenerateJob, Topic } from "@/lib/types";
import { runClientPregenerate } from "@/lib/ai/pregenerate";
import { FALLBACK_RETRY_COUNT } from "@/lib/ai/lesson-meta";
import {
  countTaxonomyFallbackLessons,
  getTopic,
  listSubjects,
  listTaxonomyFallbackTopicIds,
  listTopics,
} from "@/lib/data/curriculum";
import { useAiConfig } from "@/components/ModelSelect";
import styles from "./pregenerate.module.css";

export default function PregeneratePage() {
  const [subjects, setSubjects] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [ageStart, setAgeStart] = useState("");
  const [ageEnd, setAgeEnd] = useState("");
  const [limit, setLimit] = useState("20");
  const [force, setForce] = useState(false);
  const [onlyFallback, setOnlyFallback] = useState(false);
  const [fallbackCount, setFallbackCount] = useState<number | null>(null);
  const [job, setJob] = useState<PregenerateJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const { config } = useAiConfig();

  useEffect(() => {
    void listSubjects().then(setSubjects);
  }, []);

  const filterParams = {
    subject: subject || undefined,
    ageStart: ageStart ? Number(ageStart) : undefined,
    ageEnd: ageEnd ? Number(ageEnd) : undefined,
  };

  useEffect(() => {
    if (!onlyFallback) {
      setFallbackCount(null);
      return;
    }
    let cancelled = false;
    void countTaxonomyFallbackLessons(filterParams).then((count) => {
      if (!cancelled) setFallbackCount(count);
    });
    return () => {
      cancelled = true;
    };
  }, [onlyFallback, subject, ageStart, ageEnd]);

  const start = async () => {
    setStarting(true);
    setError(null);
    setJob(null);
    try {
      let topicIds: string[];
      if (onlyFallback) {
        topicIds = await listTaxonomyFallbackTopicIds(filterParams);
      } else {
        const { topics } = await listTopics(filterParams);
        let summaries = topics;
        if (!force) {
          summaries = summaries.filter((t) => !t.hasLesson);
        }
        topicIds = summaries.map((s) => s.id);
      }

      const lim = limit ? Number(limit) : undefined;
      if (lim != null && lim > 0) {
        topicIds = topicIds.slice(0, lim);
      }
      if (!topicIds.length) {
        throw new Error(
          onlyFallback
            ? "No taxonomy fallback lessons match filters"
            : "No topics to generate (all cached, or filters empty)",
        );
      }

      const topicsById = new Map<string, Topic>();
      await Promise.all(
        topicIds.map(async (id) => {
          const topic = await getTopic(id);
          if (topic) topicsById.set(id, topic);
        }),
      );

      await runClientPregenerate(
        {
          ...filterParams,
          limit: lim,
          force: force || onlyFallback,
          onlyTaxonomyFallback: onlyFallback,
        },
        topicIds,
        topicsById,
        { onUpdate: setJob },
      );

      if (onlyFallback) {
        const count = await countTaxonomyFallbackLessons(filterParams);
        setFallbackCount(count);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start");
    } finally {
      setStarting(false);
    }
  };

  const pct =
    job && job.total > 0
      ? Math.round(((job.done + job.failed) / job.total) * 100)
      : 0;

  return (
    <main className={styles.main}>
      <section className={`panel ${styles.hero}`}>
        <h1>Pregenerate lessons</h1>
        <p className="muted">
          Batch-create tutorials in this browser with your AI from{" "}
          <Link href="/settings">Settings</Link>
          {" "}(<code>{config.model}</code> · <code>{config.baseUrl}</code>).
          Keys stay local; only finished lessons are cached on the server.
        </p>
      </section>

      <section className={`panel ${styles.form}`}>
        <label>
          Subject
          <select value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="">All subjects</option>
            {subjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.row}>
          <label>
            Age start
            <input
              type="number"
              min={3}
              max={14}
              value={ageStart}
              onChange={(e) => setAgeStart(e.target.value)}
              placeholder="e.g. 5"
            />
          </label>
          <label>
            Age end
            <input
              type="number"
              min={3}
              max={14}
              value={ageEnd}
              onChange={(e) => setAgeEnd(e.target.value)}
              placeholder="e.g. 7"
            />
          </label>
          <label>
            Limit
            <input
              type="number"
              min={1}
              max={500}
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </label>
        </div>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
            disabled={onlyFallback}
          />
          Regenerate even if cached
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={onlyFallback}
            onChange={(e) => setOnlyFallback(e.target.checked)}
          />
          Only taxonomy fallback lessons
        </label>
        {onlyFallback && (
          <p className={`muted ${styles.fallbackHint}`}>
            {fallbackCount == null
              ? "Counting taxonomy fallbacks…"
              : fallbackCount === 0
                ? "No cached taxonomy fallback lessons match these filters."
                : `${fallbackCount} taxonomy fallback lesson${fallbackCount === 1 ? "" : "s"} to process (retries up to ${FALLBACK_RETRY_COUNT} times each until AI succeeds).`}
          </p>
        )}
        {error && <div className="error-box">{error}</div>}
        <button
          type="button"
          className="btn btn-primary"
          disabled={
            starting ||
            job?.status === "running" ||
            (onlyFallback && fallbackCount === 0)
          }
          onClick={() => void start()}
        >
          {starting
            ? "Starting…"
            : job?.status === "running"
              ? "Running…"
              : onlyFallback
                ? "Repair taxonomy fallbacks"
                : "Start pregenerate"}
        </button>
      </section>

      {job && (
        <section className={`panel ${styles.job}`}>
          <h2>Job {job.id}</h2>
          {onlyFallback && (
            <p className="muted">
              Taxonomy fallback repair · {job.total} to process
            </p>
          )}
          <p>
            Status: <strong>{job.status}</strong>
            {job.currentTopicId ? ` · current ${job.currentTopicId}` : ""}
          </p>
          <p>
            Done {job.done} · Failed {job.failed} · Total {job.total}
            {onlyFallback && fallbackCount != null && job.status !== "running"
              ? ` · ${fallbackCount} fallback${fallbackCount === 1 ? "" : "s"} remaining in cache`
              : ""}
          </p>
          <div className={styles.track}>
            <div className={styles.fill} style={{ width: `${pct}%` }} />
          </div>
          {job.errors.length > 0 && (
            <div className={styles.errors}>
              <h3>Errors</h3>
              <ul>
                {job.errors.slice(0, 20).map((e) => (
                  <li key={`${e.topicId}-${e.message.slice(0, 20)}`}>
                    <code>{e.topicId}</code>: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
