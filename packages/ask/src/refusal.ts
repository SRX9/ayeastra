/**
 * Calibrated refusal (ask doc stage 5): "we haven't collected evidence on
 * that" beats a confabulated answer every time. The model parsed; CODE
 * decides refusal — deterministic, testable, honest by construction.
 */

export const MIN_TOP_SIMILARITY = 0.35;
export const MIN_SUPPORTING_RESULTS = 2;

export type AskRefusal =
  | { kind: "internal_data" }
  | { kind: "unrelated" }
  | { kind: "unwatched"; mentions: string[] }
  | { kind: "insufficient_evidence" };

export interface ParsedScope {
  scope: "external_intel" | "internal_data" | "unrelated";
  entityIds: string[];
  unmatchedMentions: string[];
}

export interface RetrievalSignal {
  topSimilarity: number | null;
  resultCount: number;
}

/** null = answerable. Watched + unwatched mixed → answer the watched part
 * (the coverage gap goes in the answer's `gaps`, not a refusal). */
export function decideRefusal(
  parsed: ParsedScope,
  retrieval: RetrievalSignal,
): AskRefusal | null {
  if (parsed.scope === "internal_data") return { kind: "internal_data" };
  if (parsed.scope === "unrelated") return { kind: "unrelated" };
  if (parsed.unmatchedMentions.length > 0 && parsed.entityIds.length === 0) {
    return { kind: "unwatched", mentions: parsed.unmatchedMentions };
  }
  if (
    retrieval.topSimilarity === null ||
    retrieval.topSimilarity < MIN_TOP_SIMILARITY ||
    retrieval.resultCount < MIN_SUPPORTING_RESULTS
  ) {
    return { kind: "insufficient_evidence" };
  }
  return null;
}

/**
 * Honest refusal copy, built in code (no model call — nothing to hallucinate).
 * `watched` = canonical names of the org's active entities.
 */
export function refusalMessage(
  refusal: AskRefusal,
  watched: string[],
): string {
  const coverage =
    watched.length > 0
      ? ` I currently watch: ${watched.join(", ")}.`
      : " No entities are being watched yet.";
  switch (refusal.kind) {
    case "internal_data":
      return `AyeAstra watches external intelligence — I don't have your internal data, so I can't answer that.${coverage}`;
    case "unrelated":
      return `That's outside what I collect — I answer questions about the companies and markets you watch.${coverage}`;
    case "unwatched":
      return `I'm not watching ${refusal.mentions.join(", ")} yet, so I have no evidence to answer from.${coverage} Want me to add coverage?`;
    case "insufficient_evidence":
      return `I haven't collected enough evidence to answer that reliably.${coverage} Try narrowing to one of those, or ask me to widen coverage.`;
  }
}
