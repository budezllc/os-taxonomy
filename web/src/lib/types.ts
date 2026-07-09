import { z } from "zod";

export type TopicType =
  | "CONCEPTUAL"
  | "PROCEDURAL"
  | "REPRESENTATIONAL"
  | "LANGUAGE"
  | "META";

export type Topic = {
  id: string;
  type: TopicType;
  subject: string;
  domain: string | null;
  name: string | null;
  description: string;
  ageRangeStart: number | null;
  ageRangeEnd: number | null;
  centrality: number | null;
  evidence: string[];
  assessmentPrompt: string | null;
  standards: string[];
};

export type Dependency = {
  topicId: string;
  prerequisiteId: string;
  strength: "hard" | "soft";
  reason: string;
};

export type TopicFilter = {
  subject?: string;
  ageStart?: number;
  ageEnd?: number;
  q?: string;
};

export type TopicSummary = {
  id: string;
  name: string;
  subject: string;
  domain: string | null;
  ageStart: number | null;
  ageEnd: number | null;
  centrality: number;
  hardPrereqIds: string[];
  softPrereqIds: string[];
  hasLesson: boolean;
  status: "locked" | "ready" | "complete";
};

export type Edge = {
  prerequisiteId: string;
  strength: "hard" | "soft";
  reason: string;
  name?: string;
};

export const QuizQuestionSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  choices: z.array(z.string()).optional(),
  answer: z.string(),
  explanation: z.string(),
});

export const LessonContentSchema = z.object({
  topicId: z.string(),
  title: z.string(),
  ageBand: z.string(),
  explanation: z.array(z.string()).min(1).max(3),
  keyIdeas: z.array(z.string()).min(2).max(4),
  quiz: z.object({
    questions: z.array(QuizQuestionSchema).min(1),
  }),
  generatedAt: z.string(),
  model: z.string(),
});

export type LessonContent = z.infer<typeof LessonContentSchema>;
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;

export type ProgressMap = Record<string, { completedAt: string }>;

export type AiProviderName = "lmstudio" | "ollama" | "custom";

export type LearnerPet = {
  name: string;
  kind: string;
};

/** Per-request / browser overrides for any OpenAI-compatible endpoint. */
export type AiClientConfig = {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  /** Learner likes — weave into examples when generating lessons. */
  interests?: string[];
  /** Child's first name for personal references. */
  childName?: string;
  /** Pets (name + kind) for personalized examples. */
  pets?: LearnerPet[];
};

export type AiHealth = {
  ok: boolean;
  provider: AiProviderName;
  baseUrl: string;
  model?: string;
  models?: string[];
  error?: string;
};

export type PregenerateRequest = {
  subject?: string;
  ageStart?: number;
  ageEnd?: number;
  topicIds?: string[];
  limit?: number;
  force?: boolean;
};

export type PregenerateJob = {
  id: string;
  status: "queued" | "running" | "done" | "error";
  total: number;
  done: number;
  failed: number;
  currentTopicId?: string;
  errors: Array<{ topicId: string; message: string }>;
  createdAt: string;
  updatedAt: string;
};
