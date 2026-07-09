"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PregenerateJob, Topic } from "@/lib/types";
import { runClientPregenerate } from "@/lib/ai/pregenerate";
import { getTopic, listSubjects, listTopics } from "@/lib/data/curriculum";
import { useAiConfig } from "@/components/ModelSelect";
import styles from "./pregenerate.module.css";

export default function PregeneratePage() {
  const [subjects, setSubjects] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [ageStart, setAgeStart] = useState("");
  const [ageEnd, setAgeEnd] = useState("");
  const [limit, setLimit] = useState("20");
  const [force, setForce] = useState(false);
  const [job, setJob] = useState<PregenerateJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const { config } = useAiConfig();

  useEffect(() => {
    void listSubjects().then(setSubjects);
  }, []);

  const start = async () => {
    setStarting(true);
    setError(null);
    setJob(null);
    try {
      const { topics } = await listTopics({
        subject: subject || undefined,
        ageStart: ageStart ? Number(ageStart) : undefined,
        ageEnd: ageEnd ? Number(ageEnd) : undefined,
      });
      let summaries = topics;
      if (!force) {
        summaries = summaries.filter((t) => !t.hasLesson);
      }
      const lim = limit ? Number(limit) : undefined;
      if (lim != null && lim > 0) {
        summaries = summaries.slice(0, lim);
      }
      if (!summaries.length) {
        throw new Error("No topics to generate (all cached, or filters empty)");
      }

      const topicsById = new Map<string, Topic>();
      await Promise.all(
        summaries.map(async (s) => {
          const topic = await getTopic(s.id);
          if (topic) topicsById.set(s.id, topic);
        }),
      );

      await runClientPregenerate(
        {
          subject: subject || undefined,
          ageStart: ageStart ? Number(ageStart) : undefined,
          ageEnd: ageEnd ? Number(ageEnd) : undefined,
          limit: lim,
          force,
        },
        summaries.map((s) => s.id),
        topicsById,
        { onUpdate: setJob },
      );
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
          />
          Regenerate even if cached
        </label>
        {error && <div className="error-box">{error}</div>}
        <button
          type="button"
          className="btn btn-primary"
          disabled={starting || job?.status === "running"}
          onClick={() => void start()}
        >
          {starting
            ? "Starting…"
            : job?.status === "running"
              ? "Running…"
              : "Start pregenerate"}
        </button>
      </section>

      {job && (
        <section className={`panel ${styles.job}`}>
          <h2>Job {job.id}</h2>
          <p>
            Status: <strong>{job.status}</strong>
            {job.currentTopicId ? ` · current ${job.currentTopicId}` : ""}
          </p>
          <p>
            Done {job.done} · Failed {job.failed} · Total {job.total}
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
