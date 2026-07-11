"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { TopicSummary } from "@/lib/types";
import { readFilters, writeFilters } from "@/lib/prefs";
import { listTopics } from "@/lib/data/curriculum";
import { isBrowseOnlySite, isPersonalizedSite } from "@/lib/site";
import { ProgressSync } from "@/components/ProgressSync";
import styles from "./page.module.css";

type TopicsResponse = {
  topics: TopicSummary[];
  subjects: string[];
  stats: {
    total: number;
    completed: number;
    ready: number;
    locked: number;
    withLesson: number;
  };
};

const AGE_BANDS = [
  { label: "All ages", start: undefined, end: undefined },
  { label: "4–6", start: 4, end: 6 },
  { label: "5–7", start: 5, end: 7 },
  { label: "7–9", start: 7, end: 9 },
  { label: "9–11", start: 9, end: 11 },
  { label: "11–13", start: 11, end: 13 },
] as const;

export default function DashboardPage() {
  const browseOnly = isBrowseOnlySite();
  const personalizedSite = isPersonalizedSite();
  const [subjects, setSubjects] = useState<string[]>([]);
  const [subject, setSubject] = useState<string>("");
  const [ageIdx, setAgeIdx] = useState(0);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [filtersReady, setFiltersReady] = useState(false);
  const [data, setData] = useState<TopicsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = readFilters();
    if (typeof stored.subject === "string") setSubject(stored.subject);
    if (
      typeof stored.ageIdx === "number" &&
      stored.ageIdx >= 0 &&
      stored.ageIdx < AGE_BANDS.length
    ) {
      setAgeIdx(stored.ageIdx);
    }
    if (typeof stored.q === "string") {
      setQ(stored.q);
      setDebouncedQ(stored.q.trim());
    }
    setFiltersReady(true);
  }, []);

  useEffect(() => {
    if (!filtersReady) return;
    writeFilters({ subject, ageIdx, q });
  }, [subject, ageIdx, q, filtersReady]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    if (!filtersReady) return;
    setLoading(true);
    setError(null);
    const band = AGE_BANDS[ageIdx];
    try {
      const json = await listTopics({
        subject: subject || undefined,
        ageStart: band.start,
        ageEnd: band.end,
        q: debouncedQ || undefined,
      });
      setData(json);
      setSubjects(json.subjects);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [subject, ageIdx, debouncedQ, filtersReady]);

  useEffect(() => {
    void load();
  }, [load]);

  const topics = data?.topics ?? [];

  const virtualizer = useVirtualizer({
    count: topics.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 118,
    overscan: 10,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  const progressPct = useMemo(() => {
    if (!data?.stats.total) return 0;
    return Math.round((data.stats.completed / data.stats.total) * 100);
  }, [data]);

  return (
    <main className={styles.main}>
      <section className={`panel ${styles.hero}`}>
        <div>
          <p className="muted">Micro-topics · age then prerequisites</p>
          <h1 className={styles.title}>Learn in order</h1>
          <p className={styles.lead}>
            {browseOnly
              ? personalizedSite
                ? "Browse personalized lessons, take a quick quiz, and mark lessons complete. Progress stays in your browser."
                : "Browse teachable ideas, take a quick quiz, and mark lessons complete. Progress stays in your browser."
              : "Browse teachable ideas, generate a short tutorial with local or OpenAI-compatible AI, take a quick quiz, and mark lessons complete."}
          </p>
        </div>
        <div className={styles.stats}>
          <div>
            <strong>{data?.stats.total ?? "—"}</strong>
            <span>in view</span>
          </div>
          <div>
            <strong>{data?.stats.completed ?? "—"}</strong>
            <span>complete</span>
          </div>
          <div>
            <strong>{data?.stats.ready ?? "—"}</strong>
            <span>ready</span>
          </div>
          <div>
            <strong>{data?.stats.withLesson ?? "—"}</strong>
            <span>with lesson</span>
          </div>
        </div>
        <div className={styles.progressTrack} aria-hidden>
          <div
            className={styles.progressFill}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </section>

      <section className={styles.filters}>
        <div className={styles.subjectRow}>
          <button
            type="button"
            className={`chip ${subject === "" ? "active" : ""}`}
            onClick={() => setSubject("")}
          >
            All subjects
          </button>
          {subjects.map((s) => (
            <button
              key={s}
              type="button"
              className={`chip ${subject === s ? "active" : ""}`}
              onClick={() => setSubject(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <div className={styles.controls}>
          <div className={styles.ageRow}>
            {AGE_BANDS.map((band, i) => (
              <button
                key={band.label}
                type="button"
                className={`chip ${ageIdx === i ? "active" : ""}`}
                onClick={() => setAgeIdx(i)}
              >
                {band.label}
              </button>
            ))}
          </div>
          <input
            className={styles.search}
            placeholder="Search topics…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </section>

      {error && <div className="error-box">{error}</div>}

      <section className={`panel ${styles.listPanel}`}>
        {loading && !data ? (
          <p className="muted" style={{ padding: "1.25rem" }}>
            Loading curriculum…
          </p>
        ) : (
          <div ref={parentRef} className={styles.listScroll}>
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {virtualizer.getVirtualItems().map((row) => {
                const topic = topics[row.index];
                return (
                  <div
                    key={topic.id}
                    data-index={row.index}
                    ref={virtualizer.measureElement}
                    className={styles.row}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${row.start}px)`,
                    }}
                  >
                    <TopicRow topic={topic} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section className={`panel ${styles.progressPanel}`}>
        <h2 className={styles.progressHeading}>Your progress</h2>
        <ProgressSync onChanged={() => void load()} />
      </section>
    </main>
  );
}

function TopicRow({ topic }: { topic: TopicSummary }) {
  const locked = topic.status === "locked";
  return (
    <Link
      href={`/lesson/${topic.id}`}
      className={`${styles.topicLink} ${locked ? styles.locked : ""}`}
    >
      <div className={styles.topicMain}>
        <div className={styles.topicMeta}>
          <span className={`badge badge-${topic.status}`}>{topic.status}</span>
          {topic.hasLesson && (
            <span
              className={styles.cached}
              title="Lesson available"
              aria-label="Lesson available"
            >
              <GeneratedIcon />
            </span>
          )}
          <span className="muted">
            {topic.ageStart != null
              ? `Ages ${topic.ageStart}–${topic.ageEnd}`
              : "Age n/a"}
          </span>
        </div>
        <div className={styles.topicName}>{topic.name}</div>
        <div className={`muted ${styles.topicSubject}`}>
          {topic.subject}
          {topic.domain ? ` · ${topic.domain}` : ""}
        </div>
      </div>
      <span className={styles.chevron}>{locked ? "·" : "→"}</span>
    </Link>
  );
}

function GeneratedIcon() {
  return (
    <svg
      className={styles.cachedIcon}
      viewBox="0 0 20 20"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="3.5"
        y="2.5"
        width="11"
        height="15"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M6.5 7.5h6M6.5 10.5h6M6.5 13.5h3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle
        cx="14.5"
        cy="14.5"
        r="4.2"
        fill="var(--bg)"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M12.7 14.5l1.2 1.2 2.4-2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
