import OpenAI from "openai";
import { z } from "zod";
import type {
  Topic,
  LessonContent,
  AiProviderName,
  AiHealth,
  AiClientConfig,
  LearnerPet,
} from "@/lib/types";
import { LessonContentSchema } from "@/lib/types";
import { AI_DEFAULTS } from "@/lib/ai/defaults";
import {
  FALLBACK_RETRY_COUNT,
  isTaxonomyFallbackLesson,
  TAXONOMY_FALLBACK_SUFFIX,
} from "@/lib/ai/lesson-meta";

export { isTaxonomyFallbackLesson, TAXONOMY_FALLBACK_SUFFIX } from "@/lib/ai/lesson-meta";

/** @deprecated use AI_DEFAULTS.model */
export const DEFAULT_LMSTUDIO_MODEL = AI_DEFAULTS.model;

const MAX_TOKENS = Math.min(AI_DEFAULTS.maxTokens, 4096);
const MIN_EXPLANATION_PARAGRAPHS = 4;
const MIN_QUIZ_CHOICES = 3;
const QUIZ_QUESTION_COUNT = 3;

type LearnerContext = {
  childName: string;
  interests: string[];
  pets: LearnerPet[];
};

function emptyLearner(): LearnerContext {
  return { childName: "", interests: [], pets: [] };
}

function resolveLearner(options?: AiClientConfig): LearnerContext {
  const childName = (options?.childName ?? "").trim().slice(0, 40);
  const interests = (options?.interests ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
  const pets = (options?.pets ?? [])
    .map((p) => ({
      name: (p.name ?? "").trim(),
      kind: (p.kind ?? "").trim().toLowerCase(),
    }))
    .filter((p) => p.name && p.kind)
    .slice(0, 8);
  return { childName, interests, pets };
}

function hasPersonalization(learner: LearnerContext): boolean {
  return Boolean(
    learner.childName || learner.interests.length || learner.pets.length,
  );
}

function formatPetsForModel(pets: LearnerPet[]): string {
  // Kind is for the model only — lesson text should use the name alone.
  return pets
    .map((p) => `${p.name} (species/kind for examples only: ${p.kind})`)
    .join("; ");
}

function buildPersonalizationBlock(learner: LearnerContext): string {
  if (!hasPersonalization(learner)) {
    return "Use everyday examples kids know (toys, food, home, playground, school).";
  }

  const facts: string[] = [];
  if (learner.childName) facts.push(`Name: ${learner.childName}`);
  if (learner.pets.length) facts.push(`Pets: ${formatPetsForModel(learner.pets)}`);
  if (learner.interests.length) {
    facts.push(`Likes: ${learner.interests.join(", ")}`);
  }

  const pet = learner.pets[0];

  return `Optional personal touches for this learner (use sparingly — topic teaching comes first):
${facts.map((f) => `- ${f}`).join("\n")}

Personalization rules (strict):
- Use at most ONE personal detail in the entire lesson — pick name OR one pet OR one hobby, not several.
- Name: at most once, in one paragraph only. Do not open every paragraph with the name.
- Pet: at most once in the whole lesson if mentioned at all; never repeat the pet's name or refer to pets again.
- Hobby/like: at most once if used; never list likes or repeat the same hobby phrase.
- Pets in text: use ONLY the pet's given name (e.g. "${pet ? pet.name : "Whiskers"}"). Never write species words next to the name.
- Do not reuse the same sentence, catchphrase, or example wording across paragraphs.
- If a personal detail does not fit naturally, skip it — a clear generic example is better than forced personalization.`;
}

const PET_SPECIES_WORDS =
  "cat|cats|kitten|kittens|dog|dogs|puppy|puppies|fish|bird|birds|parrot|finch|hamster|rabbit|bunny|guinea pig|guineapig|pet|pets";

/** Strip "Zoey the cat" / "their cat Zoey" style labels; keep the pet's name only. */
function stripPetSpeciesLabels(
  text: string,
  pets: LearnerPet[],
): string {
  if (!text || !pets.length) return text;
  let out = text;
  for (const pet of pets) {
    const name = pet.name.trim();
    if (!name) continue;
    const n = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const kind = (pet.kind || "").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const species = kind
      ? `${kind}|${PET_SPECIES_WORDS}`
      : PET_SPECIES_WORDS;
    // "Zoey the cat" / "Zoey, the cat" / "Zoey (the cat)" — keep a following space
    out = out.replace(
      new RegExp(
        `\\b(${n})\\s*[,:]?\\s*\\(?\\s*the\\s+(?:${species})\\s*\\)?(?=\\s|[.,;!?:]|$)`,
        "gi",
      ),
      "$1",
    );
    // "the cat Zoey" / "their cat, Zoey"
    out = out.replace(
      new RegExp(
        `\\b(?:the|their|her|his|our)\\s+(?:${species})\\s*[,:]?\\s*(${n})\\b`,
        "gi",
      ),
      "$1",
    );
    // "Zoey (cat)" / "Zoey [cat]"
    out = out.replace(
      new RegExp(
        `\\b(${n})\\s*[\\(\\[]\\s*(?:${species})\\s*[\\)\\]](?=\\s|[.,;!?:]|$)`,
        "gi",
      ),
      "$1",
    );
  }
  // Collapse leftover double spaces from removals
  return out.replace(/ {2,}/g, " ").replace(/\s+([,.;!?])/g, "$1");
}

function scrubLessonPetLabels(
  lesson: LessonContent,
  learner: LearnerContext,
): LessonContent {
  if (!learner.pets.length) return lesson;
  const scrub = (s: string) => stripPetSpeciesLabels(s, learner.pets);
  return {
    ...lesson,
    title: scrub(lesson.title),
    explanation: lesson.explanation.map(scrub),
    keyIdeas: lesson.keyIdeas.map(scrub),
    quiz: {
      questions: lesson.quiz.questions.map((q) => ({
        ...q,
        prompt: scrub(q.prompt),
        answer: scrub(q.answer),
        explanation: scrub(q.explanation),
        choices: q.choices.map(scrub),
      })),
    },
  };
}

function finalizeLesson(
  lesson: LessonContent,
  learner: LearnerContext,
): LessonContent {
  return polishPersonalizedLesson(scrubLessonPetLabels(lesson, learner), learner);
}

/** Natural prose snippets for fallback / repair — not meta instructions. */
function naturalNameLead(learner: LearnerContext): string {
  if (!learner.childName) return "";
  return `${learner.childName}, `;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeForCompare(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  return parts?.map((s) => s.trim()).filter(Boolean) ?? [text.trim()];
}

/** Drop repeated sentences across paragraphs. */
function dedupeRepeatedSentences(paragraphs: string[]): string[] {
  const seen = new Set<string>();
  return paragraphs.map((paragraph) => {
    const kept = splitSentences(paragraph).filter((sentence) => {
      const key = normalizeForCompare(sentence);
      if (key.length < 24) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return kept.join(" ").trim() || paragraph.trim();
  });
}

/** Keep the first mention of each personal token; trim extras across the whole lesson. */
function limitPersonalReferences(
  lesson: LessonContent,
  learner: LearnerContext,
): LessonContent {
  if (!hasPersonalization(learner)) return lesson;

  const nameMax = 1;
  const petMax = 1;
  const interestMax = 1;

  const nameCount = { value: 0 };
  const petCounts = new Map(learner.pets.map((p) => [p.name.toLowerCase(), 0]));
  const interestCounts = new Map(
    learner.interests.map((i) => [i.toLowerCase(), 0]),
  );

  const scrub = (text: string): string => {
    let out = text;
    if (learner.childName) {
      const regex = new RegExp(
        `\\b${escapeRegExp(learner.childName)}\\b`,
        "gi",
      );
      out = out.replace(regex, (match) => {
        nameCount.value += 1;
        return nameCount.value <= nameMax ? match : "you";
      });
    }
    for (const pet of learner.pets) {
      const key = pet.name.toLowerCase();
      const regex = new RegExp(`\\b${escapeRegExp(pet.name)}\\b`, "gi");
      out = out.replace(regex, (match) => {
        const used = petCounts.get(key) ?? 0;
        petCounts.set(key, used + 1);
        return used < petMax ? match : "a friend";
      });
    }
    for (const interest of learner.interests) {
      const key = interest.toLowerCase();
      const regex = new RegExp(escapeRegExp(interest), "gi");
      out = out.replace(regex, (match) => {
        const used = interestCounts.get(key) ?? 0;
        interestCounts.set(key, used + 1);
        return used < interestMax ? match : "something you enjoy";
      });
    }
    return out.replace(/ {2,}/g, " ").trim();
  };

  return {
    ...lesson,
    title: scrub(lesson.title),
    explanation: lesson.explanation.map(scrub),
    keyIdeas: lesson.keyIdeas.map(scrub),
    quiz: {
      questions: lesson.quiz.questions.map((q) => ({
        ...q,
        prompt: scrub(q.prompt),
        answer: scrub(q.answer),
        explanation: scrub(q.explanation),
        choices: q.choices.map(scrub),
      })),
    },
  };
}

function polishPersonalizedLesson(
  lesson: LessonContent,
  learner: LearnerContext,
): LessonContent {
  const explanation = dedupeRepeatedSentences(lesson.explanation);
  const polished = {
    ...lesson,
    explanation,
  };
  return limitPersonalReferences(polished, learner);
}

/** At most one optional personal touch when the model skipped personalization entirely. */
function optionalPersonalTouch(
  paragraphs: string[],
  learner: LearnerContext,
): string[] {
  if (!hasPersonalization(learner) || paragraphs.length === 0) {
    return paragraphs;
  }

  const next = paragraphs.map((p) => p.trim());
  const blob = next.join(" ").toLowerCase();

  const alreadyPersonalized =
    (learner.childName &&
      blob.includes(learner.childName.toLowerCase())) ||
    learner.pets.some((p) => blob.includes(p.name.toLowerCase())) ||
    learner.interests.some((i) => blob.includes(i.toLowerCase()));

  if (alreadyPersonalized) return next;

  if (learner.childName) {
    const lead = naturalNameLead(learner);
    next[0] = `${lead}${next[0].charAt(0).toLowerCase()}${next[0].slice(1)}`;
    return next;
  }

  if (learner.pets[0]) {
    const pet = learner.pets[0];
    const idx = Math.min(1, next.length - 1);
    next[idx] = `${next[idx].replace(/\s+$/, "")} A quick example might involve ${pet.name}.`;
    return next;
  }

  if (learner.interests[0]) {
    const idx = Math.min(1, next.length - 1);
    next[idx] = `${next[idx].replace(/\s+$/, "")} You could tie this to ${learner.interests[0]} for practice.`;
  }

  return next;
}

function clip(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

const TERM_DEFINITIONS: Record<string, string> = {
  form: "Form is the type of writing — a letter, story, report, poem, or instructions.",
  structure:
    "Structure is how the piece is built — beginning, middle, end, and the order ideas appear.",
  register:
    "Register is how formal or casual the language sounds for the situation.",
  tone: "Tone is the mood or attitude in the writing — serious, playful, urgent, or gentle.",
  voice:
    "Voice is the personality that comes through — writing should sound like a real person, not a robot.",
  coherence:
    "Coherence means the whole piece makes sense — the main idea stays clear from start to finish.",
  cohesion:
    "Cohesion is how sentences and paragraphs link together with connecting words and repeated key ideas.",
  argument:
    "An argument is a claim supported by reasons — not a fight, but a point backed up with evidence.",
  evidence:
    "Evidence is the facts, examples, or details that prove or support a point.",
  perspective:
    "Perspective is the point of view — who is telling or seeing what happens.",
  rhetoric:
    "Rhetoric is how language is chosen to persuade or affect the reader on purpose.",
  technique:
    "A technique is a deliberate move — a vivid image, a question, or a pattern the writer repeats.",
  formal:
    "Formal language follows school or official rules — complete sentences, polite words, little slang.",
  informal:
    "Informal language is relaxed — contractions and chatty phrases, like talking to a friend.",
  style:
    "Style is the overall way a writer sounds — word choice, sentence length, and rhythm together.",
};

function extractVocabularyTerms(description: string): string[] {
  const listMatch = description.match(/[—–-]\s*([^—–-]+?)\s*[—–-]/);
  const source = listMatch?.[1] ?? description;
  return source
    .split(/,|\band\b/)
    .map((s) => s.replace(/^[^a-zA-Z]+|[^a-zA-Z' -]+$/g, "").trim())
    .filter((s) => s.length > 1 && s.length <= 40 && !/^(know|use|understand|the|and|or)$/i.test(s));
}

function defineTerm(term: string, topic: Topic): string {
  const key = term.toLowerCase().trim();
  const def = TERM_DEFINITIONS[key];
  if (def) return `${term} — ${def}`;
  return `${term} is a key idea in ${topic.name ?? topic.subject}: it names something writers or learners think about on purpose.`;
}

function teachFromEvidence(evidence: string, topic: Topic): string {
  if (/formal register.*informal register/i.test(evidence)) {
    return (
      "Formal register sounds polite and structured — like writing to a principal or filling out an official form. " +
      "Informal register sounds relaxed — like texting a friend or telling a joke at lunch. " +
      "The same message changes register: “I request your assistance” versus “Can you help me?” Choose register based on who will read your writing."
    );
  }
  if (/coherence|cohesion|paragraph structure/i.test(evidence)) {
    return (
      "Coherence means your writing makes sense as a whole — a reader can follow your main idea. " +
      "Cohesion is how you glue parts together with linking words and repeated key terms. " +
      "Good paragraph structure helps both: open with the main point, add supporting details, then wrap up before moving on."
    );
  }
  if (/purpose.*audience|audience.*purpose|purpose.*form/i.test(evidence)) {
    return (
      "Before drafting, decide your purpose (persuade, inform, entertain, or explain), your audience (friend, teacher, younger kids, public), and your form (letter, story, report, instructions). " +
      "These three choices shape tone, vocabulary, and structure — a poster for kids uses simpler words than a formal report."
    );
  }
  return (
    `${evidence} ` +
    `To understand this, pick a short ${topic.subject.toLowerCase()} example and talk through how the writer made the choice on purpose.`
  );
}

function isBoilerplateParagraph(text: string): boolean {
  return /^(You know this idea when you can|Try this together|Let's start with the big idea|When you practice this, focus|Next, make sure|You are really getting it when|This skill shows up whenever|Review the key ideas|One more thing to look for)/i.test(
    text.trim(),
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function buildTeachingExplanation(topic: Topic): string[] {
  const title = topic.name ?? "this topic";
  const terms = extractVocabularyTerms(topic.description);
  const paragraphs: string[] = [];

  if (terms.length >= 4) {
    paragraphs.push(
      `${title} is about learning important words writers use on purpose — not to sound fancy, but to name real choices. ` +
        `When you know these words, you can talk about writing clearly and spot what an author is doing to affect the reader.`,
    );
    const groups = chunk(terms, Math.ceil(terms.length / 3));
    for (const group of groups.slice(0, 3)) {
      paragraphs.push(group.map((t) => defineTerm(t, topic)).join(" "));
    }
  } else {
    paragraphs.push(
      `Let's learn ${title}. ${topic.description} ` +
        `Read each idea below slowly — each sentence explains part of what this micro-topic means.`,
    );
  }

  for (const line of topic.evidence) {
    if (paragraphs.length >= MIN_EXPLANATION_PARAGRAPHS) break;
    paragraphs.push(teachFromEvidence(line, topic));
  }

  if (topic.assessmentPrompt) {
    paragraphs.push(
      topic.assessmentPrompt
        .replaceAll("{{name}}", "you")
        .replace(/\?\s*$/, "")
        .trim() + "? Practice by comparing two short pieces — notice how tone and word choice change.",
    );
  }

  while (paragraphs.length < MIN_EXPLANATION_PARAGRAPHS) {
    paragraphs.push(
      `Keep this reference handy: ${title} builds on earlier ${topic.subject.toLowerCase()} lessons` +
        `${topic.domain ? ` in ${topic.domain}` : ""}. ` +
        `When you read or write, name the choices you see — that is how the vocabulary becomes useful, not just memorized.`,
    );
  }

  return paragraphs.slice(0, 6);
}

function teachingKeyIdeas(topic: Topic): string[] {
  const terms = extractVocabularyTerms(topic.description);
  if (terms.length >= 3) {
    return terms.slice(0, 6).map((t) => {
      const key = t.toLowerCase();
      return TERM_DEFINITIONS[key]
        ? `${t}: ${TERM_DEFINITIONS[key]}`
        : `${t} — a key ${topic.name ?? "topic"} word to know.`;
    });
  }
  return topic.evidence.slice(0, 6).map((e) => clip(teachFromEvidence(e, topic), 140));
}

function isContextOverflow(message: string): boolean {
  return /n_keep|n_ctx|context length|context window|too many tokens/i.test(
    message,
  );
}

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) return AI_DEFAULTS.baseUrl;
  if (trimmed.endsWith("/v1")) return trimmed;
  if (/^https?:\/\/[^/]+$/i.test(trimmed)) return `${trimmed}/v1`;
  return trimmed;
}

function inferProvider(baseUrl: string): AiProviderName {
  const u = baseUrl.toLowerCase();
  if (u.includes("11434") || u.includes("ollama")) return "ollama";
  if (
    u.includes("127.0.0.1:1234") ||
    u.includes("localhost:1234") ||
    u.includes("lmstudio")
  ) {
    return "lmstudio";
  }
  return "custom";
}

export type ResolvedAiConfig = {
  provider: AiProviderName;
  baseUrl: string;
  model: string;
  apiKey: string;
};

/**
 * Resolve AI config from browser Settings only.
 * Defaults match web/.env.example — never reads process.env.
 */
export function resolveAiConfig(override?: AiClientConfig): ResolvedAiConfig {
  const baseUrl = normalizeBaseUrl(
    override?.baseUrl?.trim() || AI_DEFAULTS.baseUrl,
  );
  const provider = inferProvider(baseUrl);
  const model = override?.model?.trim() || AI_DEFAULTS.model;
  const key = override?.apiKey?.trim() || "";
  // SDK requires a non-empty string; never invent a fake token name that
  // auth-enabled servers reject as "malformed".
  const apiKey = key || (provider === "ollama" ? "ollama" : "sk-local");
  return { provider, baseUrl, model, apiKey };
}

function client(config: ResolvedAiConfig) {
  return new OpenAI({
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
    timeout: 120_000,
    dangerouslyAllowBrowser: true,
  });
}

const AiLessonDraftSchema = z.object({
  title: z.string(),
  ageBand: z.string().optional(),
  explanation: z.array(z.string().min(20)).min(1).max(6),
  keyIdeas: z.array(z.string()).min(2).max(6).default([]),
  quiz: z.object({
    questions: z
      .array(
        z.object({
          id: z.string().optional(),
          prompt: z.string(),
          choices: z.array(z.string()).optional(),
          answer: z.string(),
          explanation: z.string(),
        }),
      )
      .min(1),
  }),
});

function isPlaceholderChoice(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/^(?:[A-Da-d]|option\s*[A-Da-d])$/i.test(t)) return true;
  return t.length <= 1;
}

function isLetterAnswer(text: string): boolean {
  return /^[A-Ca-c]$/.test(text.trim());
}

function hasDuplicateChoices(choices: string[]): boolean {
  const seen = new Set<string>();
  for (const c of choices) {
    const key = c.trim().toLowerCase();
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

function resolveQuizDraft(
  choices: string[],
  answer: string,
): { choices: string[]; answer: string; needsRebuild: boolean } {
  const cleaned = choices.map((c) => c.trim()).filter(Boolean);
  const trimmedAnswer = answer.trim();

  if (
    cleaned.length < MIN_QUIZ_CHOICES ||
    isTrueFalseChoices(cleaned) ||
    cleaned.some(isPlaceholderChoice) ||
    isPlaceholderChoice(trimmedAnswer)
  ) {
    return { choices: cleaned, answer: trimmedAnswer, needsRebuild: true };
  }

  if (isLetterAnswer(trimmedAnswer)) {
    const idx = trimmedAnswer.toUpperCase().charCodeAt(0) - "A".charCodeAt(0);
    if (idx >= 0 && idx < cleaned.length) {
      return { choices: cleaned, answer: cleaned[idx], needsRebuild: false };
    }
    return { choices: cleaned, answer: trimmedAnswer, needsRebuild: true };
  }

  if (
    !cleaned.some((c) => c.toLowerCase() === trimmedAnswer.toLowerCase()) ||
    hasDuplicateChoices(cleaned)
  ) {
    return { choices: cleaned, answer: trimmedAnswer, needsRebuild: true };
  }

  return { choices: cleaned, answer: trimmedAnswer, needsRebuild: false };
}

function isTrueFalseChoices(choices: string[] | undefined): boolean {
  if (!choices || choices.length !== 2) return false;
  const normalized = choices.map((c) => c.trim().toLowerCase());
  return normalized.includes("true") && normalized.includes("false");
}

function shuffleChoices(choices: string[]): string[] {
  const next = [...choices];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

type QuizBlueprint = {
  prompt: string;
  correct: string;
  wrong: [string, string];
  explanation: string;
};

const GENERIC_QUIZ_PROMPT =
  /which answer best matches this part of the lesson|which answer best shows you understand/i;

const BAD_QUIZ_CHOICE =
  /only about memorizing words|only need to guess|never shows up in real life|skip the steps|another idea that does not match|confuses this topic with an unrelated skill|not one of the lesson's main ideas/i;

function assembleQuizQuestion(
  blueprint: QuizBlueprint,
  id: string,
): {
  id: string;
  prompt: string;
  choices: string[];
  answer: string;
  explanation: string;
} {
  const answer = clip(blueprint.correct.trim(), 100);
  const choices = shuffleChoices([
    answer,
    clip(blueprint.wrong[0], 100),
    clip(blueprint.wrong[1], 100),
  ]);
  return {
    id,
    prompt: clip(blueprint.prompt, 220),
    choices,
    answer,
    explanation: clip(blueprint.explanation, 220),
  };
}

function collectQuizSources(topic: Topic, keyIdeas: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of [...topic.evidence, ...keyIdeas]) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  if (!out.length) out.push(clip(topic.description, 200));
  return out;
}

function simplifyForPrompt(source: string): string {
  return source
    .replace(/^(Explain|Identify|Use|Determine|Select|Adjust|Name|Describe)\s+(the\s+)?/i, "")
    .replace(/\s+and give an example of when each is appropriate\.?$/i, "")
    .replace(/\s+when discussing or improving their own writing\.?$/i, "")
    .replace(/\s+and explain how these shape the language choices\.?$/i, "")
    .trim();
}

function paraphraseAsAnswer(text: string): string {
  if (text.includes(":")) {
    const after = text.split(":").slice(1).join(":").trim();
    if (after.length > 12) return clip(after, 100);
  }

  const quoted = [...text.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  if (/formal register.*informal register/i.test(text)) {
    return "Can tell formal vs informal register apart with examples";
  }
  if (/coherence|cohesion|paragraph structure/i.test(text)) {
    return "Uses coherence, cohesion, and clear paragraph structure";
  }
  if (/purpose.*audience.*form/i.test(text)) {
    return "Names purpose, audience, and form before writing";
  }

  let out = simplifyForPrompt(text)
    .replace(/'/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (quoted.length === 1) {
    out = `Understands ${quoted[0]} in this topic`;
  }
  if (!/^(Can |Knows |Uses |Names |Understands )/i.test(out)) {
    out = `Can ${out.charAt(0).toLowerCase()}${out.slice(1)}`;
  }
  return clip(out, 100);
}

function ideaToQuestion(source: string, topic: Topic, index: number): string {
  const quoted = [...source.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  if (quoted.length >= 2) {
    return `Which answer shows you understand ${quoted[0]} and ${quoted[1]}?`;
  }
  if (quoted.length === 1) {
    return `What should you know about "${quoted[0]}" from this lesson?`;
  }
  if (source.includes(":")) {
    const term = source.split(":")[0]?.trim();
    if (term) return `What is the main point about ${term}?`;
  }
  const core = simplifyForPrompt(source);
  if (core.length > 10) {
    return `Which answer shows you can ${core.charAt(0).toLowerCase()}${core.slice(1)}?`;
  }
  const label = topic.name ?? "this lesson";
  return index < topic.evidence.length
    ? `Which answer matches learning goal ${index + 1} for ${label}?`
    : `Which answer matches a key idea from ${label}?`;
}

function wrongFromOtherSources(
  sources: string[],
  sourceIndex: number,
  correct: string,
): [string, string] {
  const wrong: string[] = [];
  for (let i = 0; i < sources.length; i += 1) {
    if (i === sourceIndex) continue;
    const candidate = paraphraseAsAnswer(sources[i]!);
    if (
      candidate.toLowerCase() === correct.toLowerCase() ||
      wrong.some((w) => w.toLowerCase() === candidate.toLowerCase())
    ) {
      continue;
    }
    wrong.push(candidate);
    if (wrong.length >= 2) break;
  }
  while (wrong.length < 2) {
    wrong.push(
      wrong.length === 0
        ? "This is not one of the lesson's main ideas"
        : "Confuses this topic with an unrelated skill",
    );
  }
  return [wrong[0]!, wrong[1]!];
}

function sourceToBlueprint(
  source: string,
  sources: string[],
  sourceIndex: number,
  topic: Topic,
): QuizBlueprint {
  const correct = paraphraseAsAnswer(source);
  return {
    prompt: ideaToQuestion(source, topic, sourceIndex),
    correct,
    wrong: wrongFromOtherSources(sources, sourceIndex, correct),
    explanation: clip(source, 220),
  };
}

function isRawSourceCopy(
  text: string,
  sources: string[],
): boolean {
  const t = text.trim();
  if (t.length > 120) return true;
  return sources.some(
    (s) =>
      t === s.trim() ||
      (s.length > 45 && t.includes(s.slice(0, Math.min(55, s.length)))),
  );
}

function buildQuizFromSources(
  topic: Topic,
  keyIdeas: string[] = [],
): Array<{
  id: string;
  prompt: string;
  choices: string[];
  answer: string;
  explanation: string;
}> {
  const ideas =
    keyIdeas.length > 0 ? keyIdeas : teachingKeyIdeas(topic);
  const sources = collectQuizSources(topic, ideas);
  const blueprints: QuizBlueprint[] = [];

  for (let i = 0; i < Math.min(QUIZ_QUESTION_COUNT, sources.length); i += 1) {
    blueprints.push(sourceToBlueprint(sources[i]!, sources, i, topic));
  }

  let i = 0;
  while (blueprints.length < QUIZ_QUESTION_COUNT) {
    const idx = i % sources.length;
    const bp = sourceToBlueprint(sources[idx]!, sources, idx, topic);
    if (!blueprints.some((b) => b.prompt === bp.prompt)) {
      blueprints.push(bp);
    }
    i += 1;
    if (i > sources.length * 2) break;
  }

  return blueprints
    .slice(0, QUIZ_QUESTION_COUNT)
    .map((bp, idx) => assembleQuizQuestion(bp, `q${idx + 1}`));
}

function isQualityQuiz(
  questions: Array<{
    prompt: string;
    choices?: string[];
    answer: string;
  }>,
  topic: Topic,
  keyIdeas: string[],
): boolean {
  if (questions.length < QUIZ_QUESTION_COUNT) return false;

  const sources = collectQuizSources(topic, keyIdeas);
  const prompts = new Set<string>();
  const allChoices = new Set<string>();

  for (const q of questions) {
    if (!q.prompt.trim() || GENERIC_QUIZ_PROMPT.test(q.prompt)) return false;

    const choices = (q.choices ?? []).map((c) => c.trim()).filter(Boolean);
    if (choices.length < MIN_QUIZ_CHOICES) return false;
    if (
      choices.some(isPlaceholderChoice) ||
      choices.some((c) => BAD_QUIZ_CHOICE.test(c)) ||
      choices.some((c) => c.length > 110) ||
      choices.some((c) => isRawSourceCopy(c, sources)) ||
      isRawSourceCopy(q.answer, sources)
    ) {
      return false;
    }
    if (hasDuplicateChoices(choices)) return false;
    if (!choices.some((c) => c.toLowerCase() === q.answer.trim().toLowerCase())) {
      return false;
    }

    const promptKey = q.prompt.trim().toLowerCase();
    if (prompts.has(promptKey)) return false;
    prompts.add(promptKey);

    for (const c of choices) {
      const key = c.toLowerCase();
      if (allChoices.has(key)) return false;
      allChoices.add(key);
    }
  }

  return true;
}

function normalizeQuizQuestions(
  questions: Array<{
    id?: string;
    prompt: string;
    choices?: string[];
    answer: string;
    explanation: string;
  }>,
  topic: Topic,
  keyIdeas: string[],
  _learner: LearnerContext,
): Array<{
  id: string;
  prompt: string;
  choices: string[];
  answer: string;
  explanation: string;
}> {
  const ideas = keyIdeas.length > 0 ? keyIdeas : teachingKeyIdeas(topic);

  if (isQualityQuiz(questions, topic, ideas)) {
    return questions.slice(0, QUIZ_QUESTION_COUNT).map((q, i) => {
      const id = q.id || `q${i + 1}`;
      const choices = (q.choices ?? []).slice(0, MIN_QUIZ_CHOICES);
      const matched =
        choices.find((c) => c.toLowerCase() === q.answer.trim().toLowerCase()) ??
        choices[0];
      return {
        id,
        prompt: q.prompt.trim(),
        choices,
        answer: matched,
        explanation: q.explanation.trim() || matched,
      };
    });
  }

  return buildQuizFromSources(topic, ideas);
}

/** Fix cached lessons with placeholder quizzes or thin/boilerplate explanations. */
export function repairLessonContent(
  lesson: LessonContent,
  topic: Topic,
): LessonContent {
  const thin =
    lesson.explanation.length < MIN_EXPLANATION_PARAGRAPHS ||
    lesson.explanation.some(isBoilerplateParagraph) ||
    (lesson.explanation.length === 1 &&
      lesson.explanation[0].replace(/\s+/g, " ").trim() ===
        topic.description.replace(/\s+/g, " ").trim());

  const explanation = thin
    ? padExplanationParagraphs(buildTeachingExplanation(topic), topic, emptyLearner())
    : lesson.explanation;

  const keyIdeas =
    thin || lesson.keyIdeas.some((k) => topic.evidence.includes(k))
      ? teachingKeyIdeas(topic)
      : lesson.keyIdeas;

  return repairLessonQuizzes({ ...lesson, explanation, keyIdeas }, topic);
}

function repairLessonQuizzes(
  lesson: LessonContent,
  topic: Topic,
): LessonContent {
  return {
    ...lesson,
    quiz: {
      questions: normalizeQuizQuestions(
        lesson.quiz.questions,
        topic,
        lesson.keyIdeas,
        emptyLearner(),
      ),
    },
  };
}

function padExplanationParagraphs(
  paragraphs: string[],
  topic: Topic,
  learner: LearnerContext,
): string[] {
  let next = paragraphs
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !isBoilerplateParagraph(p));

  if (
    next.length === 1 &&
    next[0].replace(/\s+/g, " ").trim() ===
      topic.description.replace(/\s+/g, " ").trim()
  ) {
    next = [];
  }

  if (next.length >= MIN_EXPLANATION_PARAGRAPHS) {
    return optionalPersonalTouch(next.slice(0, 6), learner);
  }

  for (const taught of buildTeachingExplanation(topic)) {
    if (next.length >= MIN_EXPLANATION_PARAGRAPHS) break;
    next.push(taught);
  }

  return optionalPersonalTouch(next.slice(0, 6), learner);
}

type ChatMessage = {
  content?: string | null;
  reasoning_content?: string | null;
  reasoning?: string | null;
};

function messageText(message: ChatMessage | undefined): string {
  if (!message) return "";
  const content = (message.content ?? "").trim();
  if (content) return content;
  const reasoning = (
    message.reasoning_content ??
    message.reasoning ??
    ""
  ).trim();
  return reasoning;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(candidate.slice(start, end + 1));
  }
  return JSON.parse(candidate);
}

function fallbackLessonFromTopic(
  topic: Topic,
  model: string,
  learner: LearnerContext = emptyLearner(),
): LessonContent {
  const ageBand =
    topic.ageRangeStart != null && topic.ageRangeEnd != null
      ? `Ages ${topic.ageRangeStart}–${topic.ageRangeEnd}`
      : "Primary";
  const title = topic.name ?? "Lesson";

  const explanation = padExplanationParagraphs(
    buildTeachingExplanation(topic),
    topic,
    learner,
  );

  const keyIdeas = teachingKeyIdeas(topic);
  const questions = buildQuizFromSources(topic, keyIdeas);

  return finalizeLesson(
    LessonContentSchema.parse({
      topicId: topic.id,
      title,
      ageBand,
      explanation,
      keyIdeas,
      quiz: {
        questions,
      },
      generatedAt: new Date().toISOString(),
      model: `${model} ${TAXONOMY_FALLBACK_SUFFIX}`,
    }),
    learner,
  );
}

function buildPrompt(
  topic: Topic,
  compact = false,
  learner: LearnerContext = emptyLearner(),
): string {
  const age =
    topic.ageRangeStart != null && topic.ageRangeEnd != null
      ? `${topic.ageRangeStart}-${topic.ageRangeEnd}`
      : "5-8";
  const evidence = topic.evidence
    .map((e, i) => `${i + 1}. ${clip(e, compact ? 90 : 220)}`)
    .join("\n");
  const nameForAssessment = learner.childName || "the learner";
  const assessment = compact
    ? ""
    : clip(
        (topic.assessmentPrompt ?? "").replaceAll(
          "{{name}}",
          nameForAssessment,
        ),
        180,
      );
  const personalBlock = buildPersonalizationBlock(learner);

  if (compact) {
    return `Kid lesson ages ${age}. Topic: ${clip(topic.name ?? "Lesson", 60)}
${clip(topic.description, 200)}
${personalBlock}
Evidence (cover every item in the explanation):
${evidence}
Return ONLY JSON. explanation: at least 4 paragraphs. keyIdeas: 3–6 teaching takeaways from the evidence (short definitions or main points).
Quiz: exactly ${QUIZ_QUESTION_COUNT} questions — one per evidence item, grounded in keyIdeas. Each choice is a short paraphrase (under 90 chars), not raw evidence copied verbatim.
{"title":"","ageBand":"Ages ${age}","explanation":["...","...","...","..."],"keyIdeas":["...","...","..."],"quiz":{"questions":[{"id":"q1","prompt":"Which best describes…?","choices":["First full answer option","Second full answer option","Third full answer option"],"answer":"First full answer option","explanation":""}]}}`;
  }

  return `Write a kid-friendly lesson for ages ${age} that a parent or teacher can read aloud.
Reply with ONLY one JSON object (no markdown, no preamble). Put the JSON in message content.

${personalBlock}

Shape:
{
  "title": "string",
  "ageBand": "Ages ${age}",
  "explanation": ["paragraph1", "paragraph2", "paragraph3", "paragraph4"],
  "keyIdeas": ["idea1", "idea2", "idea3"],
  "quiz": {
    "questions": [
      {"id":"q1","prompt":"Which best describes…?","choices":["Full correct answer here","Plausible wrong answer","Another wrong answer"],"answer":"Full correct answer here","explanation":""},
      {"id":"q2","prompt":"What is…?","choices":["Full correct answer here","Plausible wrong answer","Another wrong answer"],"answer":"Full correct answer here","explanation":""},
      {"id":"q3","prompt":"When would you…?","choices":["Full correct answer here","Plausible wrong answer","Another wrong answer"],"answer":"Full correct answer here","explanation":""}
    ]
  }
}

Content rules:
- explanation: at least 4 paragraphs. Each paragraph is 3–5 sentences (not 1–2).
- Teach the content — do not copy the description or evidence verbatim as a checklist. Explain what each important term and idea means in plain language with a brief example.
- If the description lists vocabulary (comma-separated or between dashes), define and explain each important term — do not merely name them.
- Never write filler paragraphs like "You know this when you can…" or "Try this together…" without teaching the ideas first.
- Cover the micro-topic completely: the child should understand every evidence item below, not just see it quoted.
- Paragraph 1: hook + overview. Paragraphs 2–3: explain the main terms and ideas with examples. Final paragraph: connect to real reading/writing and recap.
- Personal details above are optional garnish only — at most ONE (name OR one pet OR one hobby) in the entire lesson. Never repeat the same personal phrase.
- keyIdeas: 3–6 short teaching takeaways from the evidence (definitions or main points) — these feed the quiz.
- Quiz: exactly ${QUIZ_QUESTION_COUNT} multiple-choice questions — one per evidence item, testing the matching keyIdea. Correct answers paraphrase evidence/keyIdeas in short sentences (under 90 characters). Wrong answers paraphrase other evidence/keyIdeas. Never copy evidence verbatim as a choice. Never reuse a choice across questions. Never use A/B/C letters.
- Warm, simple words for the age band. Stay faithful to the topic.

Topic: ${clip(topic.name ?? "Lesson", 120)}
Subject/domain: ${topic.subject}${topic.domain ? ` / ${topic.domain}` : ""} (${topic.type})
Description: ${clip(topic.description, 600)}
Evidence (explain every item in the lesson; quiz one question per item):
${evidence}
${assessment ? `Assessment check: ${assessment}` : ""}
Quiz must test the evidence items above using keyIdeas you write.`;
}

async function resolveModel(
  openai: OpenAI,
  configured: string,
  provider: AiProviderName,
): Promise<string> {
  if (configured) return configured;
  try {
    const list = await openai.models.list();
    const first = list.data?.[0]?.id;
    if (first) return first;
  } catch {
    // fall through
  }
  return provider === "ollama" ? "llama3.2" : AI_DEFAULTS.model;
}

type CompletionParams = {
  model: string;
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  useJsonFormat: boolean;
};

async function createCompletion(
  openai: OpenAI,
  params: CompletionParams,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const body: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
    model: params.model,
    temperature: 0.3,
    max_tokens: MAX_TOKENS,
    messages: params.messages,
  };
  if (params.useJsonFormat) {
    body.response_format = { type: "json_object" };
  }
  return openai.chat.completions.create(body);
}

export async function healthCheck(
  override?: AiClientConfig,
): Promise<AiHealth> {
  const { provider, baseUrl, apiKey, model } = resolveAiConfig(override);
  try {
    const openai = new OpenAI({
      baseURL: baseUrl,
      apiKey,
      timeout: 8_000,
      dangerouslyAllowBrowser: true,
    });
    const list = await openai.models.list();
    const discovered = (list.data ?? []).map((m) => m.id);
    const models = [
      ...new Set([
        ...(provider === "lmstudio" ? [AI_DEFAULTS.model] : []),
        ...(model ? [model] : []),
        ...discovered,
      ]),
    ];
    return { ok: true, provider, baseUrl, model, models };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unable to reach AI server";
    const corsHint =
      /failed to fetch|networkerror|cors/i.test(message)
        ? " If this is a cloud API, enable CORS on the provider or use a local server (LM Studio / Ollama)."
        : "";
    const hint =
      provider === "ollama"
        ? "Start Ollama (ollama serve) and ensure a model is pulled."
        : provider === "lmstudio"
          ? "Start LM Studio, enable the Local Server, and turn on CORS if prompted."
          : "Check Base URL, API key, and that the endpoint is OpenAI-compatible.";
    return {
      ok: false,
      provider,
      baseUrl,
      model,
      models:
        provider === "lmstudio"
          ? [
              AI_DEFAULTS.model,
              ...(model && model !== AI_DEFAULTS.model ? [model] : []),
            ]
          : model
            ? [model]
            : [],
      error: `${message} — ${hint}${corsHint}`,
    };
  }
}

export async function generateLesson(
  topic: Topic,
  options?: AiClientConfig,
): Promise<LessonContent> {
  const resolved = resolveAiConfig(options);
  const { provider } = resolved;
  const learner = resolveLearner(options);
  const openai = client(resolved);
  const model =
    (await resolveModel(openai, resolved.model, provider)) ||
    (provider === "ollama" ? "llama3.2" : AI_DEFAULTS.model);

  const system = hasPersonalization(learner)
    ? `You write clear elementary lessons parents can read aloud. Each lesson must TEACH the topic: define terms, explain ideas with examples — never copy the description as a checklist or use empty "try this together" filler. Personalization is minimal: at most ONE personal detail per lesson. Reply with JSON only. explanation: at least 4 teaching paragraphs. Quiz: 3 full-sentence choices per question (never A/B/C letters). Put the full JSON in message content.`
    : "You write clear elementary lessons parents can read aloud. Each lesson must TEACH the topic: define terms and explain ideas with examples — never copy the description as a checklist. Reply with JSON only. explanation: at least 4 teaching paragraphs covering every evidence item. Quiz: 3 full-sentence choices per question (never A/B/C letters). Put the full JSON in message content.";

  async function runOnce(
    compact: boolean,
    useJsonFormat: boolean,
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    return createCompletion(openai, {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: buildPrompt(topic, compact, learner) },
      ],
      useJsonFormat,
    });
  }

  const preferJsonFormat = provider !== "ollama";

  let completion: OpenAI.Chat.Completions.ChatCompletion;
  try {
    completion = await runOnce(false, preferJsonFormat);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isContextOverflow(msg)) {
      try {
        completion = await runOnce(true, false);
      } catch (retryErr) {
        const retryMsg =
          retryErr instanceof Error ? retryErr.message : String(retryErr);
        if (isContextOverflow(retryMsg)) {
          return fallbackLessonFromTopic(topic, model, learner);
        }
        throw new Error(
          `Lesson generation failed: ${retryMsg}. Increase the model context length (e.g. 4096+) if using a local server.`,
        );
      }
    } else if (
      preferJsonFormat &&
      /response_format|json_object|unsupported/i.test(msg)
    ) {
      completion = await runOnce(false, false);
    } else {
      const hint = /401|token|auth|api.?key/i.test(msg)
        ? "Check your API key in Settings (stored only in this browser)."
        : /failed to fetch|networkerror|cors/i.test(msg)
          ? "Browser could not reach the AI URL (CORS or offline). Prefer LM Studio/Ollama locally, or a CORS-enabled OpenAI-compatible host."
          : provider === "ollama"
            ? "Start Ollama and load a model."
            : provider === "lmstudio"
              ? "Start LM Studio local server and load a model."
              : "Verify Base URL and model in Settings.";
      throw new Error(`Lesson generation failed: ${msg}. ${hint}`);
    }
  }

  const choice = completion.choices[0];
  const message = choice?.message as ChatMessage | undefined;
  const text = messageText(message);

  if (!text) {
    return fallbackLessonFromTopic(topic, model, learner);
  }

  let parsed: unknown;
  try {
    parsed = extractJson(text);
  } catch {
    return fallbackLessonFromTopic(topic, model, learner);
  }

  if (parsed && typeof parsed === "object") {
    const obj = parsed as { explanation?: unknown; keyIdeas?: unknown };
    if (Array.isArray(obj.explanation)) {
      obj.explanation = padExplanationParagraphs(
        obj.explanation.filter(
          (p): p is string => typeof p === "string" && p.trim().length > 0,
        ),
        topic,
        learner,
      );
    }
    if (Array.isArray(obj.keyIdeas)) {
      obj.keyIdeas = obj.keyIdeas
        .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
        .map((k) => k.trim())
        .slice(0, 4);
    }
  }

  try {
    const draft = AiLessonDraftSchema.parse(parsed);
    const ageBand =
      draft.ageBand ||
      (topic.ageRangeStart != null && topic.ageRangeEnd != null
        ? `Ages ${topic.ageRangeStart}–${topic.ageRangeEnd}`
        : "Primary");

    let explanation = padExplanationParagraphs(
      draft.explanation,
      topic,
      learner,
    );

    const quizQuestions = normalizeQuizQuestions(
      draft.quiz.questions,
      topic,
      draft.keyIdeas,
      learner,
    );

    const lesson: LessonContent = {
      topicId: topic.id,
      title: draft.title || topic.name || "Lesson",
      ageBand,
      explanation,
      keyIdeas: draft.keyIdeas.slice(0, 6),
      quiz: {
        questions: quizQuestions,
      },
      generatedAt: new Date().toISOString(),
      model,
    };

    return finalizeLesson(LessonContentSchema.parse(lesson), learner);
  } catch {
    return fallbackLessonFromTopic(topic, model, learner);
  }
}

/**
 * Generate until the model succeeds (non-fallback) or retries are exhausted.
 * Returns the last lesson either way; callers should check isTaxonomyFallbackLesson.
 */
export async function generateLessonWithRetries(
  topic: Topic,
  options?: AiClientConfig,
  maxRetries: number = FALLBACK_RETRY_COUNT,
): Promise<{ lesson: LessonContent; attempts: number }> {
  const maxAttempts = maxRetries + 1;
  let last: LessonContent | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    last = await generateLesson(topic, options);
    if (!isTaxonomyFallbackLesson(last)) {
      return { lesson: last, attempts: attempt };
    }
  }

  return { lesson: last!, attempts: maxAttempts };
}
