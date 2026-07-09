/**
 * Browser defaults — mirrors web/.env.example.
 * The app does not read process.env for AI settings.
 */
export const AI_DEFAULTS = {
  provider: "lmstudio" as const,
  baseUrl: "http://127.0.0.1:1234/v1",
  model: "google/gemma-4-12b-qat:2",
  /** Empty by default; local servers often need no key. */
  apiKey: "",
  maxTokens: 1536,
} as const;

export const AI_PRESETS = {
  lmstudio: {
    label: "LM Studio",
    baseUrl: "http://127.0.0.1:1234/v1",
    model: AI_DEFAULTS.model,
  },
  ollama: {
    label: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    model: "llama3.2",
  },
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
} as const;
