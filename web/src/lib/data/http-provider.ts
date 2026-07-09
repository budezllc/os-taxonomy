/**
 * Future remote data source (HTTP API or MCP bridge).
 * Implement the same methods as LocalJsonDataProvider and swap in getDataProvider().
 */
import type {
  Topic,
  TopicFilter,
  TopicSummary,
  Edge,
  LessonContent,
  ProgressMap,
} from "@/lib/types";

export class HttpDataProvider {
  constructor(private baseUrl: string) {}

  async listTopics(filter?: TopicFilter): Promise<TopicSummary[]> {
    const params = new URLSearchParams();
    if (filter?.subject) params.set("subject", filter.subject);
    if (filter?.ageStart != null) params.set("ageStart", String(filter.ageStart));
    if (filter?.ageEnd != null) params.set("ageEnd", String(filter.ageEnd));
    if (filter?.q) params.set("q", filter.q);
    const res = await fetch(`${this.baseUrl}/topics?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { topics: TopicSummary[] };
    return json.topics;
  }

  async getTopic(id: string): Promise<Topic | null> {
    const res = await fetch(`${this.baseUrl}/topics/${id}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { topic: Topic };
    return json.topic;
  }

  async getPrerequisites(id: string): Promise<Edge[]> {
    const res = await fetch(`${this.baseUrl}/topics/${id}/prerequisites`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { prerequisites: Edge[] };
    return json.prerequisites;
  }

  async getLesson(id: string): Promise<LessonContent | null> {
    const res = await fetch(`${this.baseUrl}/lessons/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { lesson: LessonContent | null };
    return json.lesson;
  }

  async saveLesson(lesson: LessonContent): Promise<void> {
    const res = await fetch(`${this.baseUrl}/lessons/${lesson.topicId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lesson),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async getProgress(): Promise<ProgressMap> {
    const res = await fetch(`${this.baseUrl}/progress`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { progress: ProgressMap };
    return json.progress;
  }

  async setComplete(id: string, done: boolean): Promise<ProgressMap> {
    const res = await fetch(`${this.baseUrl}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicId: id, done }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { progress: ProgressMap };
    return json.progress;
  }
}
