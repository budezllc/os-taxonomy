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

/** @deprecated use AI_DEFAULTS.model */
export const DEFAULT_LMSTUDIO_MODEL = AI_DEFAULTS.model;

const MAX_TOKENS = Math.min(AI_DEFAULTS.maxTokens, 2048);

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

  const name = learner.childName || "the child";
  const pet = learner.pets[0];
  const like = learner.interests[0];
  const exampleBits: string[] = [];
  if (learner.childName) {
    exampleBits.push(`"${name}, picture lining up cookies…"`);
  }
  if (pet) {
    exampleBits.push(
      `"…like counting how many steps ${pet.name} takes across the rug"`,
    );
  }
  if (like) {
    exampleBits.push(`"…the same way ${like} uses rows and columns"`);
  }

  return `Personal world for this learner (use naturally — do not list these as a checklist):
${facts.map((f) => `- ${f}`).join("\n")}

How to weave them in:
- Speak to ${name} by first name once or twice, the way a parent would while reading aloud.
- Pets: write ONLY the pet's given name in the lesson (e.g. "${pet ? pet.name : "Whiskers"}"). Never write species words like cat, dog, fish, bird next to the name. Never write patterns like "NAME the cat" or "their cat NAME". Use species only in your private planning to choose fitting actions (leaping onto a shelf, running across the yard, swimming the length of a tank).
- Turn likes into the scene of an example (baking, Roblox builds, sewing stitches), not a separate "you like X" sentence.
- Spread details across the three explanation paragraphs; never dump name + pets + likes into one awkward sentence.
- Sound warm and story-like. Good: ${exampleBits.slice(0, 2).join(" / ") || `"${name}, think about sharing cookies…"`}.`;
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
        choices: q.choices?.map(scrub),
      })),
    },
  };
}

/** Natural prose snippets for fallback / repair — not meta instructions. */
function naturalNameLead(learner: LearnerContext): string {
  if (!learner.childName) return "";
  return `${learner.childName}, `;
}

function naturalPetExample(learner: LearnerContext): string {
  const pet = learner.pets[0];
  if (!pet) return "";
  const kind = pet.kind.toLowerCase();
  // Kind shapes the scene; only the name appears in the sentence.
  if (/cat|kitten/.test(kind)) {
    return `Picture ${pet.name} leaping up onto a shelf — that little scene can make the idea stick.`;
  }
  if (/dog|puppy/.test(kind)) {
    return `Picture ${pet.name} bounding across the yard — that little scene can make the idea stick.`;
  }
  if (/fish/.test(kind)) {
    return `Picture ${pet.name} swimming from one end of the tank to the other — that little scene can make the idea stick.`;
  }
  if (/bird|parrot|finch/.test(kind)) {
    return `Picture ${pet.name} hopping along a perch — that little scene can make the idea stick.`;
  }
  if (/hamster|guinea|rabbit|bunny/.test(kind)) {
    return `Picture ${pet.name} scurrying across the floor — that little scene can make the idea stick.`;
  }
  return `Picture ${pet.name} right there in the example — that makes the idea stick.`;
}

function naturalInterestExample(learner: LearnerContext): string {
  const likes = learner.interests.slice(0, 2);
  if (!likes.length) return "";
  if (likes.length === 1) {
    return `It's a lot like ${likes[0]}: once you see it that way, the idea clicks.`;
  }
  return `It's a lot like ${likes[0]} or ${likes[1]}: once you see it that way, the idea clicks.`;
}

function weaveMissingDetails(
  paragraphs: string[],
  learner: LearnerContext,
): string[] {
  if (!hasPersonalization(learner) || paragraphs.length === 0) {
    return paragraphs;
  }

  const next = paragraphs.map((p) => p.trim());
  const blob = next.join(" ").toLowerCase();

  const nameMissing =
    Boolean(learner.childName) &&
    !blob.includes(learner.childName.toLowerCase());
  const petMissing =
    learner.pets.length > 0 &&
    !learner.pets.some((p) => blob.includes(p.name.toLowerCase()));
  const likesMissing =
    learner.interests.length > 0 &&
    learner.interests.filter((i) => blob.includes(i.toLowerCase())).length <
      Math.min(2, learner.interests.length);

  // Open with the child's name when missing — reads like read-aloud.
  if (nameMissing && learner.childName) {
    const lead = naturalNameLead(learner);
    if (!next[0].toLowerCase().startsWith(learner.childName.toLowerCase())) {
      next[0] = `${lead}${next[0].charAt(0).toLowerCase()}${next[0].slice(1)}`;
    }
  }

  // Fold pet into the middle paragraph when possible.
  if (petMissing) {
    const petLine = naturalPetExample(learner);
    const idx = next.length >= 2 ? 1 : 0;
    next[idx] = `${next[idx].replace(/\s+$/, "")} ${petLine}`;
  }

  // Fold likes into the last paragraph.
  if (likesMissing) {
    const likeLine = naturalInterestExample(learner);
    const idx = next.length - 1;
    next[idx] = `${next[idx].replace(/\s+$/, "")} ${likeLine}`;
  }

  return next;
}

function clip(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
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
  explanation: z.array(z.string().min(20)).min(2).max(3),
  keyIdeas: z.array(z.string()).min(2).max(4).default([]),
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
  const who = learner.childName || "you";
  const pet = learner.pets[0];
  const likes = learner.interests.slice(0, 2);

  const open = learner.childName
    ? `${learner.childName}, here's the big idea: ${topic.description}`
    : topic.description;

  let practice: string;
  if (pet && likes.length) {
    practice = `Try this together: pretend ${pet.name} is helping with a ${likes[0]} project — use that scene to practice, then ask ${who} to show the idea in their own words.`;
  } else if (pet) {
    practice = `Try this together: use a real moment with ${pet.name} as your example, then ask ${who} to explain it back.`;
  } else if (likes.length) {
    practice = `Try this together: pick a ${likes[0]}${likes[1] ? ` or ${likes[1]}` : ""} example from home, then ask ${who} to show the idea in their own words.`;
  } else {
    practice = `Try this together: use a real example at home or school, then ask ${who} to show you in their own words.`;
  }

  const mastery = topic.evidence.length
    ? `You know this idea when you can: ${topic.evidence.slice(0, 2).join("; ")}.`
    : `Ask ${who} to explain the idea back in their own words.`;

  const explanation = weaveMissingDetails(
    [open, mastery, practice].slice(0, 3),
    learner,
  );

  const assessment = (topic.assessmentPrompt ?? "")
    .replaceAll("{{name}}", learner.childName || "you")
    .trim();

  const questions: Array<{
    id: string;
    prompt: string;
    choices?: string[];
    answer: string;
    explanation: string;
  }> = topic.evidence.slice(0, 3).map((e, i) => ({
    id: `q${i + 1}`,
    prompt: `True or false: ${e}`,
    choices: ["True", "False"],
    answer: "True",
    explanation: e,
  }));

  if (questions.length < 3 && assessment) {
    questions.push({
      id: `q${questions.length + 1}`,
      prompt: assessment,
      answer: "Answers will vary — check against the evidence criteria above.",
      explanation: "Use the mastery evidence to judge the response.",
    });
  }

  while (questions.length < 3) {
    questions.push({
      id: `q${questions.length + 1}`,
      prompt: learner.childName
        ? `${learner.childName}, in your own words, what is "${title}" about?`
        : `In your own words, what is "${title}" about?`,
      answer: topic.description,
      explanation: "Compare to the topic description.",
    });
  }

  return scrubLessonPetLabels(
    LessonContentSchema.parse({
      topicId: topic.id,
      title,
      ageBand,
      explanation,
      keyIdeas: topic.evidence.slice(0, 4),
      quiz: {
        questions: questions.slice(0, 3),
      },
      generatedAt: new Date().toISOString(),
      model: `${model} (taxonomy fallback)`,
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
    .slice(0, compact ? 2 : 4)
    .map((e, i) => `${i + 1}. ${clip(e, compact ? 70 : 160)}`)
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
${clip(topic.description, 160)}
${personalBlock}
Evidence:
${evidence}
Return ONLY JSON. explanation: exactly 3 paragraphs (each 3–4 sentences with one concrete example). keyIdeas: 3 items.
{"title":"","ageBand":"Ages ${age}","explanation":["...","...","..."],"keyIdeas":["...","...","..."],"quiz":{"questions":[{"id":"q1","prompt":"","choices":["A","B","C"],"answer":"A","explanation":""},{"id":"q2","prompt":"","choices":["A","B","C"],"answer":"B","explanation":""},{"id":"q3","prompt":"","answer":"","explanation":""}]}}`;
  }

  return `Write a kid-friendly lesson for ages ${age} that a parent or teacher can read aloud.
Reply with ONLY one JSON object (no markdown, no preamble). Put the JSON in message content.

${personalBlock}

Shape:
{
  "title": "string",
  "ageBand": "Ages ${age}",
  "explanation": ["paragraph1", "paragraph2", "paragraph3"],
  "keyIdeas": ["idea1", "idea2", "idea3"],
  "quiz": {
    "questions": [
      {"id":"q1","prompt":"","choices":["A","B","C"],"answer":"A","explanation":""},
      {"id":"q2","prompt":"","choices":["A","B","C"],"answer":"B","explanation":""},
      {"id":"q3","prompt":"","answer":"","explanation":""}
    ]
  }
}

Content rules:
- explanation: exactly 3 paragraphs. Each paragraph is 3–4 sentences (not 1–2, not 5+).
- Personal details above must appear as natural story examples inside the paragraphs — never as a bullet list or "you like X" aside.
- Cover the evidence criteria in plain language without padding.
- keyIdeas: exactly 3 short takeaways (topic ideas, not a repeat of the child's name/pets).
- Quiz: exactly 3 questions grounded in the evidence; prefer multiple choice when it fits. One question may gently use the child's name or a pet's name if it fits (never label the pet's species in the quiz text).
- Warm, simple words for the age band. Stay faithful to the topic.

Topic: ${clip(topic.name ?? "Lesson", 120)}
Subject/domain: ${topic.subject}${topic.domain ? ` / ${topic.domain}` : ""} (${topic.type})
Description: ${clip(topic.description, 500)}
Evidence:
${evidence}
${assessment ? `Assessment check: ${assessment}` : ""}`;
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
    ? `You write clear elementary lessons parents can read aloud. When given a child's name, pets, and likes, fold them into examples like a story — never as a checklist or meta note. For pets, use only their given names in the text (never "NAME the cat/dog" or species labels). Reply with JSON only. explanation must be exactly 3 paragraphs, each 3–4 sentences. Put the full JSON in message content.`
    : "You write clear elementary lessons parents can read aloud. Reply with JSON only. explanation must be exactly 3 paragraphs, each 3–4 sentences. Put the full JSON in message content.";

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
      obj.explanation = obj.explanation
        .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
        .map((p) => p.trim())
        .slice(0, 3);
      // Pad short paragraphs so local models that write briefly still validate.
      obj.explanation = (obj.explanation as string[]).map((p) =>
        p.length >= 20
          ? p
          : `${p} Think about a real example and say it in your own words.`,
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

    let explanation = weaveMissingDetails(
      draft.explanation.slice(0, 3),
      learner,
    );

    const lesson: LessonContent = {
      topicId: topic.id,
      title: draft.title || topic.name || "Lesson",
      ageBand,
      explanation,
      keyIdeas: draft.keyIdeas.slice(0, 4),
      quiz: {
        questions: draft.quiz.questions.map((q, i) => ({
          id: q.id || `q${i + 1}`,
          prompt: q.prompt,
          choices: q.choices,
          answer: q.answer,
          explanation: q.explanation,
        })),
      },
      generatedAt: new Date().toISOString(),
      model,
    };

    return scrubLessonPetLabels(LessonContentSchema.parse(lesson), learner);
  } catch {
    return fallbackLessonFromTopic(topic, model, learner);
  }
}
