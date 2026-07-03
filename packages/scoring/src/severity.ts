/**
 * Final severity — deterministic, inspectable, tunable without re-prompting
 * (scoring doc: "the LLM judges; code decides"). Every constant here is a
 * product decision reviewable in a PR, and every sub-score persists to
 * signals.scores so the UI can always answer "why HIGH?".
 */

export type Severity = "critical" | "high" | "notable" | "info";
export type Confidence = "high" | "moderate" | "low";
export type Materiality = "cosmetic" | "content" | "material";
export type Tier = "primary" | "secondary" | "watch";

/** materiality classification → base points. */
const MATERIALITY_POINTS: Record<Materiality, number> = {
  material: 100,
  content: 55,
  cosmetic: 10,
};

/** Kind weight: pricing > changelog > careers > docs (doc table). */
const KIND_WEIGHT: Record<string, number> = {
  pricing: 1.0,
  changelog: 0.9,
  filings: 0.9,
  blog: 0.8,
  app_store: 0.8,
  review_data: 0.8, // structured, provider-verified voice of customer
  hiring_data: 0.75, // structured postings beat careers-page diffs
  news: 0.7,
  keyword_feed: 0.7, // category watches share news-grade trust
  homepage: 0.7,
  careers: 0.6,
  docs: 0.5,
};

const TIER_WEIGHT: Record<Tier, number> = {
  primary: 1.0,
  secondary: 0.6,
  watch: 0.3,
};

/** Categories that can justify CRITICAL (hard rule #1). */
const CRITICAL_CATEGORIES = new Set([
  "pricing",
  "packaging",
  "launch",
  "funding",
  "messaging",
  // 2.1 — an acquisition or a market entry against a primary-tier entity
  // with a priority attachment is critical-capable.
  "ma",
  "market_entry",
]);

export const SEVERITY_THRESHOLDS = { critical: 75, high: 50, notable: 25 } as const;

export interface ScoringInput {
  materiality: Materiality;
  sourceKind: string;
  category: string;
  tier: Tier;
  /** org_entities.importance (1–5, 3 = default). */
  importance: number | null;
  /** ground-signal relevance, 0–100. */
  grounding: number;
  /** 1 = brand new, → 0 for near-repeats (dedup engine). */
  noveltyFactor: number;
  /** Per-org learned (entity × category) multiplier, 0.5–1.5. */
  feedbackAdjust: number;
  confidence: Confidence;
  /** ≥1 priority/segment/positioning attachment from ground-signal. */
  hasAttachment: boolean;
}

export interface ScoreDecomposition {
  severity: Severity;
  /** Raw combined score before hard rules. */
  score: number;
  /** Every factor, persisted to signals.scores — no black boxes. */
  factors: {
    materialityPoints: number;
    kindWeight: number;
    entityWeight: number;
    groundingFactor: number;
    noveltyFactor: number;
    feedbackAdjust: number;
  };
  /** Hard rules that fired, for the "why this severity" UI. */
  capsApplied: string[];
}

export function scoreSignal(input: ScoringInput): ScoreDecomposition {
  const materialityPoints =
    MATERIALITY_POINTS[input.materiality] * (KIND_WEIGHT[input.sourceKind] ?? 0.7);
  const importanceFactor = clamp((input.importance ?? 3) / 3, 0.5, 1.25);
  const entityWeight = TIER_WEIGHT[input.tier] * importanceFactor;
  const groundingFactor = 0.5 + clamp(input.grounding, 0, 100) / 200;
  const noveltyFactor = clamp(input.noveltyFactor, 0, 1);
  const feedbackAdjust = clamp(input.feedbackAdjust, 0.5, 1.5);

  const score =
    materialityPoints * entityWeight * groundingFactor * noveltyFactor * feedbackAdjust;

  let severity: Severity =
    score >= SEVERITY_THRESHOLDS.critical
      ? "critical"
      : score >= SEVERITY_THRESHOLDS.high
        ? "high"
        : score >= SEVERITY_THRESHOLDS.notable
          ? "notable"
          : "info";

  const capsApplied: string[] = [];

  // Hard rule #1 — CRITICAL is rare by construction.
  if (
    severity === "critical" &&
    !(
      input.tier === "primary" &&
      CRITICAL_CATEGORIES.has(input.category) &&
      input.hasAttachment
    )
  ) {
    severity = "high";
    capsApplied.push("critical_requires_primary_category_attachment");
  }

  // Context-neutral signals cap at NOTABLE (scoring acceptance #2).
  if (!input.hasAttachment && rank(severity) > rank("notable")) {
    severity = "notable";
    capsApplied.push("context_neutral_caps_at_notable");
  }

  // Hard rule #2 — uncertain claims never page anyone.
  if (input.confidence === "low" && rank(severity) > rank("notable")) {
    severity = "notable";
    capsApplied.push("low_confidence_caps_at_notable");
  }

  return {
    severity,
    score: round2(score),
    factors: {
      materialityPoints: round2(materialityPoints),
      kindWeight: KIND_WEIGHT[input.sourceKind] ?? 0.7,
      entityWeight: round2(entityWeight),
      groundingFactor: round2(groundingFactor),
      noveltyFactor,
      feedbackAdjust,
    },
    capsApplied,
  };
}

function rank(s: Severity): number {
  return { info: 0, notable: 1, high: 2, critical: 3 }[s];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
