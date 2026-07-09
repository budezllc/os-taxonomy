"use client";

import { useCallback, useEffect, useState } from "react";
import type { AiHealth } from "@/lib/types";
import {
  DEFAULT_AI_BASE_URL,
  DEFAULT_AI_MODEL,
  INTEREST_SUGGESTIONS,
  PET_KIND_SUGGESTIONS,
  defaultAiConfig,
  defaultLearnerProfile,
  normalizeInterest,
  readLearnerProfile,
  readLessonCacheMode,
  writeLearnerProfile,
  writeLessonCacheMode,
  type LessonCacheMode,
  type StoredAiConfig,
  type StoredLearnerProfile,
  type StoredPet,
} from "@/lib/prefs";
import { AI_PRESETS } from "@/lib/ai/defaults";
import { healthCheck } from "@/lib/ai/provider";
import { invalidateLessonsCache } from "@/lib/data/curriculum";
import { useAiConfig } from "@/components/ModelSelect";
import { ThemeToggle } from "@/components/ThemeToggle";
import styles from "./settings.module.css";

const PRESETS = Object.values(AI_PRESETS);
const MAX_INTERESTS = 24;
const MAX_PETS = 8;

export default function SettingsPage() {
  const { config, setConfig, ready } = useAiConfig();
  const [draft, setDraft] = useState<StoredAiConfig>(defaultAiConfig());
  const [health, setHealth] = useState<AiHealth | null>(null);
  const [checking, setChecking] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);
  /** Only show status after the user clicks Save or Test. */
  const [tested, setTested] = useState(false);

  const [profile, setProfile] = useState<StoredLearnerProfile>(
    defaultLearnerProfile(),
  );
  const [profileReady, setProfileReady] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [interestDraft, setInterestDraft] = useState("");
  const [petNameDraft, setPetNameDraft] = useState("");
  const [petKindDraft, setPetKindDraft] = useState("");
  const [cacheMode, setCacheMode] = useState<LessonCacheMode>("standard");

  useEffect(() => {
    if (ready) setDraft(config);
  }, [ready, config]);

  useEffect(() => {
    setProfile(readLearnerProfile());
    setCacheMode(readLessonCacheMode());
    setProfileReady(true);
  }, []);

  const refreshHealth = useCallback(async (cfg: StoredAiConfig) => {
    setChecking(true);
    setTested(true);
    try {
      const json = await healthCheck({
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        model: cfg.model,
      });
      setHealth(json);
    } catch {
      setHealth({
        ok: false,
        provider: "custom",
        baseUrl: cfg.baseUrl || DEFAULT_AI_BASE_URL,
        model: cfg.model || DEFAULT_AI_MODEL,
        models: [cfg.model || DEFAULT_AI_MODEL],
        error: "Could not reach AI endpoint from this browser",
      });
    } finally {
      setChecking(false);
    }
  }, []);

  const save = () => {
    const next: StoredAiConfig = {
      baseUrl: draft.baseUrl.trim() || DEFAULT_AI_BASE_URL,
      apiKey: draft.apiKey,
      model: draft.model.trim() || DEFAULT_AI_MODEL,
    };
    setConfig(next);
    setDraft(next);
    setSaved(true);
    void refreshHealth(next);
    window.setTimeout(() => setSaved(false), 2000);
  };

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    setDraft((d) => ({
      ...d,
      baseUrl: preset.baseUrl,
      model: preset.model,
    }));
    setTested(false);
    setHealth(null);
  };

  const persistProfile = (next: StoredLearnerProfile) => {
    writeLearnerProfile(next);
    setProfile(readLearnerProfile());
    setProfileSaved(true);
    window.setTimeout(() => setProfileSaved(false), 2000);
  };

  const saveChildName = (raw: string) => {
    persistProfile({
      ...profile,
      childName: normalizeInterest(raw).slice(0, 40),
    });
  };

  const addInterest = (raw: string) => {
    const value = normalizeInterest(raw);
    if (!value) return;
    const lower = value.toLowerCase();
    if (profile.interests.some((i) => i.toLowerCase() === lower)) {
      setInterestDraft("");
      return;
    }
    if (profile.interests.length >= MAX_INTERESTS) return;
    persistProfile({
      ...profile,
      interests: [...profile.interests, value],
    });
    setInterestDraft("");
  };

  const removeInterest = (value: string) => {
    persistProfile({
      ...profile,
      interests: profile.interests.filter((i) => i !== value),
    });
  };

  const toggleSuggestion = (value: string) => {
    const lower = value.toLowerCase();
    if (profile.interests.some((i) => i.toLowerCase() === lower)) {
      persistProfile({
        ...profile,
        interests: profile.interests.filter((i) => i.toLowerCase() !== lower),
      });
      return;
    }
    if (profile.interests.length >= MAX_INTERESTS) return;
    persistProfile({
      ...profile,
      interests: [...profile.interests, value],
    });
  };

  const addPet = () => {
    const name = normalizeInterest(petNameDraft);
    const kind = normalizeInterest(petKindDraft).toLowerCase();
    if (!name || !kind) return;
    if (profile.pets.length >= MAX_PETS) return;
    const key = `${name.toLowerCase()}|${kind}`;
    if (
      profile.pets.some(
        (p) => `${p.name.toLowerCase()}|${p.kind.toLowerCase()}` === key,
      )
    ) {
      setPetNameDraft("");
      return;
    }
    const next: StoredPet = { name, kind };
    persistProfile({ ...profile, pets: [...profile.pets, next] });
    setPetNameDraft("");
  };

  const removePet = (pet: StoredPet) => {
    persistProfile({
      ...profile,
      pets: profile.pets.filter(
        (p) =>
          !(
            p.name.toLowerCase() === pet.name.toLowerCase() &&
            p.kind.toLowerCase() === pet.kind.toLowerCase()
          ),
      ),
    });
  };

  const selectCacheMode = (mode: LessonCacheMode) => {
    writeLessonCacheMode(mode);
    setCacheMode(mode);
    invalidateLessonsCache();
  };

  return (
    <main className={styles.main}>
      <section className={`panel ${styles.hero}`}>
        <h1>Settings</h1>
        <p className="muted">
          Connect an OpenAI-compatible API to generate lessons. Your Base URL,
          model, and API key stay in this browser only.
        </p>
      </section>

      <section className={`panel ${styles.section}`}>
        <h2>Lesson cache</h2>
        <p className="muted">
          Choose which file local generate and browse use. Standard is what
          ships to the static site; personalized stays on this machine.
        </p>
        <div className={styles.cacheModes}>
          <button
            type="button"
            className={`chip${cacheMode === "standard" ? " active" : ""}`}
            onClick={() => selectCacheMode("standard")}
          >
            Standard
          </button>
          <button
            type="button"
            className={`chip${cacheMode === "personalized" ? " active" : ""}`}
            onClick={() => selectCacheMode("personalized")}
          >
            Personalized
          </button>
        </div>
        <p className={`muted ${styles.cacheHint}`}>
          {cacheMode === "personalized" ? (
            <>
              Writing to <code>web/data/lessons-cache-personalized.json</code>{" "}
              (gitignored). Generations use the learner profile below.
            </>
          ) : (
            <>
              Writing to <code>web/data/lessons-cache.json</code> for the hosted
              site. Generations stay generic (no name/pets/likes).
            </>
          )}
        </p>
      </section>

      <section className={`panel ${styles.section}`}>
        <h2>Learner profile</h2>
        <p className="muted">
          Name, pets, and likes stay in this browser. New lessons use them so
          examples feel personal.
        </p>

        {profileReady ? (
          <>
            <div className={styles.form}>
              <label>
                <span>Child&apos;s name</span>
                <input
                  value={profile.childName}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, childName: e.target.value }))
                  }
                  onBlur={(e) => saveChildName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  placeholder="e.g. Maya"
                  autoComplete="off"
                  maxLength={40}
                />
              </label>
            </div>

            <h3 className={styles.subhead}>Pets</h3>
            <p className="muted">
              Add each pet&apos;s name and what they are (cat, dog, fish…).
            </p>
            <div className={styles.interestTags}>
              {profile.pets.length === 0 ? (
                <p className={`muted ${styles.interestEmpty}`}>No pets yet.</p>
              ) : (
                profile.pets.map((pet) => (
                  <button
                    key={`${pet.name}|${pet.kind}`}
                    type="button"
                    className={`chip active ${styles.interestChip}`}
                    onClick={() => removePet(pet)}
                    aria-label={`Remove ${pet.name} the ${pet.kind}`}
                  >
                    {pet.name} · {pet.kind}
                    <span aria-hidden="true">×</span>
                  </button>
                ))
              )}
            </div>
            <div className={styles.petAdd}>
              <input
                value={petNameDraft}
                onChange={(e) => setPetNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addPet();
                  }
                }}
                placeholder="Pet name"
                autoComplete="off"
                spellCheck={false}
                maxLength={40}
              />
              <input
                value={petKindDraft}
                onChange={(e) => setPetKindDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addPet();
                  }
                }}
                placeholder="Type (cat, dog…)"
                autoComplete="off"
                spellCheck={false}
                maxLength={32}
              />
              <button
                type="button"
                className="btn"
                disabled={
                  !normalizeInterest(petNameDraft) ||
                  !normalizeInterest(petKindDraft)
                }
                onClick={addPet}
              >
                Add pet
              </button>
            </div>
            <p className={`muted ${styles.suggestLabel}`}>Pet type</p>
            <div className={styles.presets}>
              {PET_KIND_SUGGESTIONS.map((k) => {
                const active = petKindDraft.toLowerCase() === k;
                return (
                  <button
                    key={k}
                    type="button"
                    className={`chip${active ? " active" : ""}`}
                    onClick={() => setPetKindDraft(k)}
                  >
                    {k}
                  </button>
                );
              })}
            </div>

            <h3 className={styles.subhead}>What they like</h3>
            <p className="muted">
              Hobbies, games, foods — anything that makes examples click.
            </p>
            <div className={styles.interestTags}>
              {profile.interests.length === 0 ? (
                <p className={`muted ${styles.interestEmpty}`}>
                  No likes yet — try a suggestion or type your own.
                </p>
              ) : (
                profile.interests.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`chip active ${styles.interestChip}`}
                    onClick={() => removeInterest(item)}
                    aria-label={`Remove ${item}`}
                  >
                    {item}
                    <span aria-hidden="true">×</span>
                  </button>
                ))
              )}
            </div>

            <div className={styles.interestAdd}>
              <input
                value={interestDraft}
                onChange={(e) => setInterestDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addInterest(interestDraft);
                  }
                }}
                placeholder="e.g. cookies, sewing, Roblox"
                autoComplete="off"
                maxLength={48}
              />
              <button
                type="button"
                className="btn"
                disabled={!normalizeInterest(interestDraft)}
                onClick={() => addInterest(interestDraft)}
              >
                Add
              </button>
            </div>

            <p className={`muted ${styles.suggestLabel}`}>Suggestions</p>
            <div className={styles.presets}>
              {INTEREST_SUGGESTIONS.map((s) => {
                const active = profile.interests.some(
                  (i) => i.toLowerCase() === s.toLowerCase(),
                );
                return (
                  <button
                    key={s}
                    type="button"
                    className={`chip${active ? " active" : ""}`}
                    onClick={() => toggleSuggestion(s)}
                  >
                    {s}
                  </button>
                );
              })}
            </div>

            {profileSaved ? (
              <p className={styles.saved}>Saved — used on the next generate</p>
            ) : null}
          </>
        ) : null}
      </section>

      <section className={`panel ${styles.section}`}>
        <h2>AI connection</h2>
        <p className="muted">
          Paste your provider URL and key, then save. Keys are never sent to this
          site&apos;s server.
        </p>

        <div className={styles.presets}>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="chip"
              onClick={() => applyPreset(p)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className={styles.form}>
          <label>
            <span>Base URL</span>
            <input
              value={draft.baseUrl}
              onChange={(e) => {
                setDraft((d) => ({ ...d, baseUrl: e.target.value }));
                setTested(false);
              }}
              placeholder="https://api.openai.com/v1"
              autoComplete="off"
              spellCheck={false}
            />
          </label>

          <label>
            <span>API key</span>
            <div className={styles.keyRow}>
              <input
                type={showKey ? "text" : "password"}
                value={draft.apiKey}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, apiKey: e.target.value }));
                  setTested(false);
                }}
                placeholder="sk-…"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                className="btn secondary"
                onClick={() => setShowKey((v) => !v)}
              >
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          <label>
            <span>Model</span>
            <input
              value={draft.model}
              onChange={(e) => {
                setDraft((d) => ({ ...d, model: e.target.value }));
                setTested(false);
              }}
              placeholder={DEFAULT_AI_MODEL}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          {tested && health?.ok && health.models && health.models.length > 0 ? (
            <label>
              <span>Pick discovered model</span>
              <select
                value={
                  health.models.includes(draft.model) ? draft.model : ""
                }
                onChange={(e) => {
                  const next = e.target.value;
                  if (!next) return;
                  setDraft((d) => ({ ...d, model: next }));
                  setTested(false);
                }}
              >
                <option value="">Choose…</option>
                {health.models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        <div className={styles.actions}>
          <button type="button" className="btn" onClick={save}>
            Save connection
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={checking}
            onClick={() => void refreshHealth(draft)}
          >
            {checking ? "Checking…" : "Test connection"}
          </button>
          {saved ? <span className={styles.saved}>Saved</span> : null}
        </div>

        {checking && (
          <div className={styles.healthRow}>
            <p className="muted" style={{ margin: 0 }}>
              Checking connection…
            </p>
          </div>
        )}

        {!checking && tested && health?.ok && (
          <div className={styles.healthRow}>
            <div className="success-box">
              Connected ({health.provider}) at <code>{health.baseUrl}</code>
              {health.model ? (
                <>
                  {" "}
                  · model <code>{health.model}</code>
                </>
              ) : null}
            </div>
          </div>
        )}

        {!checking && tested && health && !health.ok && (
          <div className={styles.healthRow}>
            <div className="error-box">{health.error}</div>
          </div>
        )}
      </section>

      <section className={`panel ${styles.section}`}>
        <h2>Appearance</h2>
        <p className="muted">Toggle light or dark mode. Preference is saved.</p>
        <ThemeToggle />
      </section>
    </main>
  );
}
