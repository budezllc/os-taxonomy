import { AI_DEFAULTS } from "@/lib/ai/defaults";

export const FILTERS_KEY = "gradeschool-micro-lessons:filters";
export const THEME_KEY = "gradeschool-micro-lessons:theme";
/** @deprecated migrated into AI_CONFIG_KEY */
export const MODEL_KEY = "lesson-tutorials:model";
export const AI_CONFIG_KEY = "gradeschool-micro-lessons:ai";
/** @deprecated migrated into LEARNER_PROFILE_KEY */
export const INTERESTS_KEY = "gradeschool-micro-lessons:interests";
export const LEARNER_PROFILE_KEY = "gradeschool-micro-lessons:learner";
export const LESSON_CACHE_MODE_KEY = "gradeschool-micro-lessons:lesson-cache";

export type StoredFilters = {
  subject?: string;
  ageIdx?: number;
  q?: string;
};

export type ThemeMode = "light" | "dark";

export type StoredAiConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

/** Things the learner likes — used to personalize lesson examples. */
export type StoredInterests = string[];

export type StoredPet = {
  name: string;
  kind: string;
};

export type StoredLearnerProfile = {
  childName: string;
  interests: StoredInterests;
  pets: StoredPet[];
};

/** Which on-disk lesson cache local generate/read uses. */
export type LessonCacheMode = "standard" | "personalized";

export const INTEREST_SUGGESTIONS = [
  "cookies",
  "cooking",
  "sewing",
  "Roblox",
  "dinosaurs",
  "soccer",
  "drawing",
  "Minecraft",
  "animals",
  "space",
] as const;

export const PET_KIND_SUGGESTIONS = [
  "cat",
  "dog",
  "fish",
  "bird",
  "hamster",
  "rabbit",
  "guinea pig",
] as const;

export const DEFAULT_AI_BASE_URL = AI_DEFAULTS.baseUrl;
export const DEFAULT_AI_MODEL = AI_DEFAULTS.model;

export function readFilters(): StoredFilters {
  if (typeof window === "undefined") return {};
  try {
    const raw =
      localStorage.getItem(FILTERS_KEY) ||
      localStorage.getItem("lesson-tutorials:filters");
    if (!raw) return {};
    return JSON.parse(raw) as StoredFilters;
  } catch {
    return {};
  }
}

export function writeFilters(filters: StoredFilters): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
}

export function readTheme(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  const stored =
    localStorage.getItem(THEME_KEY) ||
    localStorage.getItem("lesson-tutorials:theme");
  if (stored === "dark" || stored === "light") return stored;
  return "dark";
}

export function writeTheme(theme: ThemeMode): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.dataset.theme = theme;
}

export function applyTheme(theme: ThemeMode): void {
  document.documentElement.dataset.theme = theme;
}

export function defaultAiConfig(): StoredAiConfig {
  return {
    baseUrl: AI_DEFAULTS.baseUrl,
    apiKey: "",
    model: AI_DEFAULTS.model,
  };
}

export function readAiConfig(): StoredAiConfig {
  const defaults = defaultAiConfig();
  if (typeof window === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(AI_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredAiConfig>;
      return {
        baseUrl: parsed.baseUrl?.trim() || defaults.baseUrl,
        apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
        model: parsed.model?.trim() || defaults.model,
      };
    }
  } catch {
    // fall through
  }
  const legacyModel =
    localStorage.getItem(MODEL_KEY)?.trim() ||
    localStorage.getItem("lesson-tutorials:model")?.trim();
  return {
    ...defaults,
    model: legacyModel || defaults.model,
  };
}

export function writeAiConfig(config: StoredAiConfig): void {
  if (typeof window === "undefined") return;
  const next: StoredAiConfig = {
    baseUrl: config.baseUrl.trim() || AI_DEFAULTS.baseUrl,
    apiKey: config.apiKey,
    model: config.model.trim() || AI_DEFAULTS.model,
  };
  localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(next));
}

export function readSelectedModel(fallback: string): string {
  return readAiConfig().model || fallback;
}

export function writeSelectedModel(model: string): void {
  const current = readAiConfig();
  writeAiConfig({ ...current, model });
}

export function normalizeInterest(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

function cleanInterests(interests: StoredInterests): StoredInterests {
  return interests
    .map(normalizeInterest)
    .filter(Boolean)
    .filter((item, i, arr) => {
      const lower = item.toLowerCase();
      return arr.findIndex((x) => x.toLowerCase() === lower) === i;
    })
    .slice(0, 24);
}

function cleanPets(pets: StoredPet[]): StoredPet[] {
  return pets
    .map((p) => ({
      name: normalizeInterest(p.name ?? ""),
      kind: normalizeInterest(p.kind ?? "").toLowerCase(),
    }))
    .filter((p) => p.name && p.kind)
    .filter((p, i, arr) => {
      const key = `${p.name.toLowerCase()}|${p.kind}`;
      return (
        arr.findIndex(
          (x) => `${x.name.toLowerCase()}|${x.kind}` === key,
        ) === i
      );
    })
    .slice(0, 8);
}

export function defaultLearnerProfile(): StoredLearnerProfile {
  return { childName: "", interests: [], pets: [] };
}

function readLegacyInterests(): StoredInterests {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(INTERESTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return cleanInterests(
      parsed.filter((item): item is string => typeof item === "string"),
    );
  } catch {
    return [];
  }
}

export function readLearnerProfile(): StoredLearnerProfile {
  const defaults = defaultLearnerProfile();
  if (typeof window === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(LEARNER_PROFILE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredLearnerProfile>;
      return {
        childName: normalizeInterest(
          typeof parsed.childName === "string" ? parsed.childName : "",
        ).slice(0, 40),
        interests: Array.isArray(parsed.interests)
          ? cleanInterests(
              parsed.interests.filter(
                (item): item is string => typeof item === "string",
              ),
            )
          : [],
        pets: Array.isArray(parsed.pets)
          ? cleanPets(
              parsed.pets.filter(
                (p): p is StoredPet =>
                  !!p &&
                  typeof p === "object" &&
                  typeof (p as StoredPet).name === "string" &&
                  typeof (p as StoredPet).kind === "string",
              ),
            )
          : [],
      };
    }
  } catch {
    // fall through
  }
  return {
    ...defaults,
    interests: readLegacyInterests(),
  };
}

export function writeLearnerProfile(profile: StoredLearnerProfile): void {
  if (typeof window === "undefined") return;
  const next: StoredLearnerProfile = {
    childName: normalizeInterest(profile.childName).slice(0, 40),
    interests: cleanInterests(profile.interests),
    pets: cleanPets(profile.pets),
  };
  localStorage.setItem(LEARNER_PROFILE_KEY, JSON.stringify(next));
}

/** @deprecated use readLearnerProfile().interests */
export function readInterests(): StoredInterests {
  return readLearnerProfile().interests;
}

/** @deprecated use writeLearnerProfile */
export function writeInterests(interests: StoredInterests): void {
  const current = readLearnerProfile();
  writeLearnerProfile({ ...current, interests });
}

export function readLessonCacheMode(): LessonCacheMode {
  if (typeof window === "undefined") return "standard";
  const raw = localStorage.getItem(LESSON_CACHE_MODE_KEY);
  return raw === "personalized" ? "personalized" : "standard";
}

export function writeLessonCacheMode(mode: LessonCacheMode): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    LESSON_CACHE_MODE_KEY,
    mode === "personalized" ? "personalized" : "standard",
  );
}
