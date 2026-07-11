import type { ReactNode } from "react";
import fs from "node:fs";
import path from "node:path";

export function generateStaticParams(): Array<{ id: string }> {
  const isExport =
    process.env.NEXT_PUBLIC_STATIC_SITE === "true" ||
    process.env.NEXT_PUBLIC_PERSONALIZED_SITE === "true";
  if (!isExport) {
    return [];
  }
  try {
    const topicsPath = path.join(process.cwd(), "..", "data", "topics.json");
    const raw = fs.readFileSync(topicsPath, "utf8");
    const parsed = JSON.parse(raw) as { topics: Array<{ id: string }> };
    return parsed.topics.map((t) => ({ id: t.id }));
  } catch {
    return [];
  }
}

export default function LessonLayout({ children }: { children: ReactNode }) {
  return children;
}
