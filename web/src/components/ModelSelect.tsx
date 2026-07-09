"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_AI_MODEL,
  readAiConfig,
  writeAiConfig,
  type StoredAiConfig,
} from "@/lib/prefs";

export const GEMMA_MODEL = DEFAULT_AI_MODEL;

export function useAiConfig() {
  const [config, setConfig] = useState<StoredAiConfig>(() => ({
    baseUrl: "http://127.0.0.1:1234/v1",
    apiKey: "",
    model: GEMMA_MODEL,
  }));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setConfig(readAiConfig());
    setReady(true);
  }, []);

  const update = (partial: Partial<StoredAiConfig>) => {
    const next = { ...readAiConfig(), ...partial };
    writeAiConfig(next);
    setConfig(next);
  };

  return { config, setConfig: update, ready };
}
