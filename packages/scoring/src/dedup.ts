import { createHash } from "node:crypto";

/**
 * Dedup & novelty (scoring doc): exact dedup_key match kills re-detections
 * before grounding spends a model call; embedding similarity ≥ 0.92 against
 * the org's last 30 days makes it a follow-up (linked, not re-alerted).
 */

export const FOLLOW_UP_SIMILARITY = 0.92;

/** entityId + category + stable fact fingerprint. */
export function dedupKey(
  entityId: string,
  category: string,
  extractedFacts: unknown,
): string {
  const fingerprint = createHash("sha256")
    .update(stableStringify(extractedFacts ?? null), "utf8")
    .digest("hex")
    .slice(0, 16);
  return `${entityId}:${category}:${fingerprint}`;
}

/** Deterministic JSON: object keys sorted at every depth. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  }
  return value;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    throw new Error("cosineSimilarity: dimension mismatch");
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Novelty factor for scoring: 1 for brand-new, discounting toward 0.5 as
 * similarity to the org's recent signals approaches the follow-up gate.
 */
export function noveltyFactor(maxSimilarityToRecent: number | null): number {
  if (maxSimilarityToRecent === null) return 1;
  if (maxSimilarityToRecent >= FOLLOW_UP_SIMILARITY) return 0; // follow-up, not a new signal
  const s = Math.max(0, maxSimilarityToRecent);
  return 1 - 0.5 * (s / FOLLOW_UP_SIMILARITY);
}
