import type { RetrievedItem } from "./retrieval";

/**
 * Hybrid merge (ask doc stage 2): reciprocal-rank fusion across the vector
 * and keyword lists. RRF needs no score normalization — exactly what mixing
 * cosine similarity with ts_rank requires. Deterministic and testable.
 */

const RRF_K = 60;

export interface MergedItem extends RetrievedItem {
  rrfScore: number;
}

export function rrfMerge(
  lists: RetrievedItem[][],
  limit = 30,
): MergedItem[] {
  const byId = new Map<string, MergedItem>();
  for (const list of lists) {
    list.forEach((item, rank) => {
      const contribution = 1 / (RRF_K + rank + 1);
      const existing = byId.get(item.id);
      if (existing) {
        existing.rrfScore += contribution;
        // Keep the more informative score (vector similarity beats ts_rank
        // only in scale — retain the max as "best signal seen").
        existing.score = Math.max(existing.score, item.score);
      } else {
        byId.set(item.id, { ...item, rrfScore: contribution });
      }
    });
  }
  return [...byId.values()]
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, limit);
}

/** Top cosine similarity across vector lists — the refusal-gate input. */
export function topSimilarity(vectorLists: RetrievedItem[][]): number | null {
  let top: number | null = null;
  for (const list of vectorLists) {
    for (const item of list) {
      if (top === null || item.score > top) top = item.score;
    }
  }
  return top;
}
