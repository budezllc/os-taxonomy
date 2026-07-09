import type { Topic, Dependency, TopicSummary } from "@/lib/types";

type IndexNode = {
  id: string;
  name: string;
  subject: string;
  domain: string | null;
  ageStart: number | null;
  ageEnd: number | null;
  centrality: number;
  hardPrereqIds: string[];
  softPrereqIds: string[];
};

export function buildIndex(
  topics: Topic[],
  dependencies: Dependency[],
): IndexNode[] {
  const hard = new Map<string, string[]>();
  const soft = new Map<string, string[]>();

  for (const d of dependencies) {
    const map = d.strength === "hard" ? hard : soft;
    const list = map.get(d.topicId) ?? [];
    list.push(d.prerequisiteId);
    map.set(d.topicId, list);
  }

  return topics.map((t) => ({
    id: t.id,
    name: t.name ?? t.description.slice(0, 60),
    subject: t.subject,
    domain: t.domain,
    ageStart: t.ageRangeStart,
    ageEnd: t.ageRangeEnd,
    centrality: t.centrality ?? 0,
    hardPrereqIds: hard.get(t.id) ?? [],
    softPrereqIds: soft.get(t.id) ?? [],
  }));
}

/**
 * Topological sort within a filtered set using hard edges only.
 * Tie-break: ageStart asc → centrality desc → name.
 */
export function sortCurriculum(nodes: IndexNode[]): IndexNode[] {
  const ids = new Set(nodes.map((n) => n.id));
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const indegree = new Map<string, number>();
  const children = new Map<string, string[]>();

  for (const id of ids) {
    indegree.set(id, 0);
    children.set(id, []);
  }

  for (const node of nodes) {
    for (const pre of node.hardPrereqIds) {
      if (!ids.has(pre)) continue;
      indegree.set(node.id, (indegree.get(node.id) ?? 0) + 1);
      children.get(pre)!.push(node.id);
    }
  }

  const ready = nodes
    .filter((n) => (indegree.get(n.id) ?? 0) === 0)
    .sort(compareNodes);

  const result: IndexNode[] = [];
  const heap = [...ready];

  while (heap.length) {
    heap.sort(compareNodes);
    const next = heap.shift()!;
    result.push(next);
    for (const childId of children.get(next.id) ?? []) {
      const d = (indegree.get(childId) ?? 1) - 1;
      indegree.set(childId, d);
      if (d === 0) {
        const child = byId.get(childId);
        if (child) heap.push(child);
      }
    }
  }

  // Cycles / leftovers: append by tie-break
  if (result.length < nodes.length) {
    const seen = new Set(result.map((n) => n.id));
    const rest = nodes.filter((n) => !seen.has(n.id)).sort(compareNodes);
    result.push(...rest);
  }

  return result;
}

function compareNodes(a: IndexNode, b: IndexNode): number {
  const ageA = a.ageStart ?? 99;
  const ageB = b.ageStart ?? 99;
  if (ageA !== ageB) return ageA - ageB;
  if (b.centrality !== a.centrality) return b.centrality - a.centrality;
  return a.name.localeCompare(b.name);
}

export function withStatus(
  nodes: IndexNode[],
  completed: Set<string>,
  hasLesson: Set<string>,
  filterIds: Set<string>,
): TopicSummary[] {
  return nodes.map((n) => {
    const blocking = n.hardPrereqIds.filter((id) => filterIds.has(id));
    const unlocked =
      completed.has(n.id) ||
      blocking.every((id) => completed.has(id));
    let status: TopicSummary["status"] = "locked";
    if (completed.has(n.id)) status = "complete";
    else if (unlocked) status = "ready";

    return {
      ...n,
      hasLesson: hasLesson.has(n.id),
      status,
    };
  });
}
