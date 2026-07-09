import type { ProgressMap } from "@/lib/types";

export const PROGRESS_KEY = "micro-lessons:progress";

export function readProgress(): ProgressMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ProgressMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeProgress(progress: ProgressMap): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

export function setProgressComplete(
  topicId: string,
  done: boolean,
): ProgressMap {
  const progress = { ...readProgress() };
  if (done) {
    progress[topicId] = { completedAt: new Date().toISOString() };
  } else {
    delete progress[topicId];
  }
  writeProgress(progress);
  return progress;
}

export function exportProgressJson(): string {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      progress: readProgress(),
    },
    null,
    2,
  );
}

export function importProgressJson(
  raw: string,
  mode: "merge" | "replace" = "merge",
): ProgressMap {
  const parsed = JSON.parse(raw) as {
    progress?: ProgressMap;
  } & ProgressMap;
  const incoming =
    parsed.progress && typeof parsed.progress === "object"
      ? parsed.progress
      : (parsed as ProgressMap);
  if (!incoming || typeof incoming !== "object") {
    throw new Error("Invalid progress file");
  }
  const next =
    mode === "replace" ? { ...incoming } : { ...readProgress(), ...incoming };
  writeProgress(next);
  return next;
}

export function downloadProgressExport(): void {
  const blob = new Blob([exportProgressJson()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `micro-lessons-progress-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
