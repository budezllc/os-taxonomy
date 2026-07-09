"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { Edge, LessonContent, Topic } from "@/lib/types";
import { generateLesson } from "@/lib/ai/provider";
import { useAiConfig } from "@/components/ModelSelect";
import { readLearnerProfile, readLessonCacheMode } from "@/lib/prefs";
import {
  getLesson,
  getPrerequisites,
  getTopic,
  listTopics,
  rememberLesson,
} from "@/lib/data/curriculum";
import { readProgress, setProgressComplete } from "@/lib/progress";
import { isStaticSite } from "@/lib/site";
import styles from "./lesson.module.css";

type Phase = "tutorial" | "quiz" | "results";

export default function LessonPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const staticSite = isStaticSite();

  const [topic, setTopic] = useState<Topic | null>(null);
  const [prerequisites, setPrerequisites] = useState<Edge[]>([]);
  const [lesson, setLesson] = useState<LessonContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("tutorial");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [complete, setComplete] = useState(false);
  const [nextId, setNextId] = useState<string | null>(null);
  const { config } = useAiConfig();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const t = await getTopic(id);
      if (!t) throw new Error("Topic not found");
      const [prereqs, cached] = await Promise.all([
        getPrerequisites(id),
        getLesson(id),
      ]);
      setTopic(t);
      setPrerequisites(prereqs);
      setLesson(cached);
      setComplete(Boolean(readProgress()[id]));
      setPhase("tutorial");
      setAnswers({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    async function findNext() {
      if (!topic) return;
      const { topics } = await listTopics({ subject: topic.subject });
      const idx = topics.findIndex((t) => t.id === id);
      for (let i = idx + 1; i < topics.length; i++) {
        if (topics[i].status !== "locked") {
          setNextId(topics[i].id);
          return;
        }
      }
      setNextId(null);
    }
    void findNext();
  }, [topic, id]);

  const generate = async (force = false) => {
    if (!topic || staticSite) return;
    setGenerating(true);
    setError(null);
    try {
      if (!force && lesson) {
        setPhase("tutorial");
        return;
      }
      const profile = readLearnerProfile();
      const cacheMode = readLessonCacheMode();
      const useProfile = cacheMode === "personalized";
      const generated = await generateLesson(topic, {
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        childName: useProfile ? profile.childName : undefined,
        interests: useProfile ? profile.interests : undefined,
        pets: useProfile ? profile.pets : undefined,
      });
      const res = await fetch(`/api/lessons/${id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          force: true,
          lesson: generated,
          cache: cacheMode,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to cache lesson");
      const saved = (json.lesson as LessonContent) ?? generated;
      rememberLesson(saved);
      setLesson(saved);
      setPhase("tutorial");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const markComplete = (done: boolean) => {
    setProgressComplete(id, done);
    setComplete(done);
  };

  const score = useMemo(() => {
    if (!lesson || phase !== "results") return null;
    let correct = 0;
    for (const q of lesson.quiz.questions) {
      const a = (answers[q.id] ?? "").trim().toLowerCase();
      const expected = q.answer.trim().toLowerCase();
      if (a && (a === expected || expected.includes(a) || a.includes(expected))) {
        correct += 1;
      }
    }
    return { correct, total: lesson.quiz.questions.length };
  }, [lesson, answers, phase]);

  if (loading) {
    return (
      <main className={styles.main}>
        <p className="muted">Loading lesson…</p>
      </main>
    );
  }

  if (!topic) {
    return (
      <main className={styles.main}>
        <div className="error-box">{error ?? "Topic not found"}</div>
        <Link href="/">← Dashboard</Link>
      </main>
    );
  }

  const hard = prerequisites.filter((p) => p.strength === "hard");
  const soft = prerequisites.filter((p) => p.strength === "soft");

  return (
    <main className={styles.main}>
      <div className={styles.crumb}>
        <Link href="/">← Dashboard</Link>
        <span className="muted">
          {topic.subject}
          {topic.domain ? ` · ${topic.domain}` : ""}
        </span>
      </div>

      {error && <div className="error-box">{error}</div>}

      {!lesson && (
        <section className={`panel ${styles.fallback}`}>
          <h2>{staticSite ? "Lesson not available" : "Before AI generates"}</h2>
          <p className="muted">
            {staticSite
              ? "This topic does not have a pre-generated lesson in the published cache yet. You can still review mastery criteria below."
              : "You can still review mastery criteria below. Configure AI in Settings, then generate a full tutorial + quiz."}
          </p>
          {!staticSite && (
            <div className={styles.actions}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={generating}
                onClick={() => void generate(false)}
              >
                {generating ? "Generating…" : "Generate lesson"}
              </button>
            </div>
          )}
        </section>
      )}

      {lesson && (
        <section className={`panel ${styles.lesson}`}>
          <div className={styles.phaseTabs}>
            <button
              type="button"
              className={phase === "tutorial" ? styles.tabActive : ""}
              onClick={() => setPhase("tutorial")}
            >
              Tutorial
            </button>
            <button
              type="button"
              className={
                phase === "quiz" || phase === "results" ? styles.tabActive : ""
              }
              onClick={() => setPhase("quiz")}
            >
              Quiz
            </button>
          </div>

          {phase === "tutorial" && (
            <div className={styles.tutorial}>
              <h2>{lesson.title}</h2>
              {lesson.explanation.map((p) => (
                <p key={p.slice(0, 40)}>{p}</p>
              ))}
              {lesson.keyIdeas.length > 0 && (
                <>
                  <h3>Key ideas</h3>
                  <ul>
                    {lesson.keyIdeas.map((k) => (
                      <li key={k}>{k}</li>
                    ))}
                  </ul>
                </>
              )}
              <button
                type="button"
                className={`btn btn-primary ${styles.startQuiz}`}
                onClick={() => setPhase("quiz")}
              >
                Start quiz
              </button>
            </div>
          )}

          {(phase === "quiz" || phase === "results") && (
            <div className={styles.quiz}>
              {lesson.quiz.questions.map((q, i) => (
                <div key={q.id} className={styles.question}>
                  <h3>
                    {i + 1}. {q.prompt}
                  </h3>
                  {q.choices?.length ? (
                    <div className={styles.choices}>
                      {q.choices.map((c) => (
                        <label key={c} className={styles.choice}>
                          <input
                            type="radio"
                            name={q.id}
                            value={c}
                            disabled={phase === "results"}
                            checked={answers[q.id] === c}
                            onChange={() =>
                              setAnswers((prev) => ({ ...prev, [q.id]: c }))
                            }
                          />
                          <span>{c}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <input
                      className={styles.shortAnswer}
                      disabled={phase === "results"}
                      value={answers[q.id] ?? ""}
                      onChange={(e) =>
                        setAnswers((prev) => ({
                          ...prev,
                          [q.id]: e.target.value,
                        }))
                      }
                      placeholder="Your answer"
                    />
                  )}
                  {phase === "results" && (
                    <div className={styles.answerReveal}>
                      <strong>Answer:</strong> {q.answer}
                      <p className="muted">{q.explanation}</p>
                    </div>
                  )}
                </div>
              ))}

              {phase === "quiz" ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setPhase("results")}
                >
                  Check answers
                </button>
              ) : (
                <div className={styles.resultsBar}>
                  <div className="success-box">
                    Score: {score?.correct}/{score?.total}
                  </div>
                  <div className={styles.resultsActions}>
                    {!complete ? (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => markComplete(true)}
                      >
                        Mark complete
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => markComplete(false)}
                      >
                        Undo complete
                      </button>
                    )}
                    {nextId && (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => router.push(`/lesson/${nextId}`)}
                      >
                        Next lesson →
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className={styles.lessonFooter}>
            <p className={`muted ${styles.meta}`}>
              Generated {new Date(lesson.generatedAt).toLocaleString()} · model{" "}
              {lesson.model}
            </p>
            {!staticSite && (
              <button
                type="button"
                className="btn secondary"
                disabled={generating}
                onClick={() => void generate(true)}
              >
                {generating ? "Regenerating…" : "Regenerate"}
              </button>
            )}
          </div>
        </section>
      )}

      <section className={`panel ${styles.header}`}>
        <div className={styles.headerMain}>
          <p className={`muted ${styles.headerMeta}`}>
            {complete ? (
              <span className="badge badge-complete">Complete</span>
            ) : (
              <span className="badge badge-ready">In progress</span>
            )}
            <span>
              {topic.ageRangeStart != null
                ? `Ages ${topic.ageRangeStart}–${topic.ageRangeEnd}`
                : "Primary"}{" "}
              · {topic.type.toLowerCase()}
            </span>
          </p>
          <h1 className={styles.title}>{topic.name ?? "Untitled topic"}</h1>
          <p className={styles.desc}>{topic.description}</p>
          {hard.length > 0 && (
            <div className={styles.headerPrereqs}>
              <h2 className={styles.headerPrereqsTitle}>Hard prerequisites</h2>
              <ul className={styles.headerPrereqsList}>
                {hard.map((p) => (
                  <li key={p.prerequisiteId}>
                    <Link
                      href={`/lesson/${p.prerequisiteId}`}
                      className={styles.prereqLink}
                    >
                      {p.name ?? p.prerequisiteId}
                    </Link>
                    {p.reason ? (
                      <span className={styles.prereqReason}> — {p.reason}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <section className={`panel ${styles.reference}`}>
        <h2>For parents & teachers</h2>
        <p className="muted">
          Use these mastery checks alongside the lesson — they come from the
          curriculum taxonomy.
        </p>
        {topic.evidence.length > 0 && (
          <>
            <h3>Evidence</h3>
            <ul>
              {topic.evidence.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </>
        )}
        {soft.length > 0 && (
          <>
            <h3>Helpful before</h3>
            <ul>
              {soft.map((p) => (
                <li key={p.prerequisiteId}>
                  <Link
                    href={`/lesson/${p.prerequisiteId}`}
                    className={styles.prereqLink}
                  >
                    {p.name ?? p.prerequisiteId}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}
