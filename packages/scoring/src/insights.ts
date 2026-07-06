/**
 * Insights v1 rule groupers (scoring doc): rule-triggered, model-verified,
 * low volume. These pure rules nominate candidate groups from a 30-day
 * window per entity; a heavy-tier verifier task decides if a real pattern
 * exists. Better zero insights than one stretched correlation.
 */

export interface SignalLite {
  id: string;
  entityId: string;
  category: string;
  severity: "critical" | "high" | "notable" | "info";
  createdAt: Date;
}

export interface InsightCandidate {
  rule: string;
  entityId: string;
  signalIds: string[];
}

const PAIR_RULES: Array<{ rule: string; a: string; b: string }> = [
  { rule: "pricing_plus_hiring", a: "pricing", b: "hiring" },
  { rule: "launch_plus_messaging", a: "launch", b: "messaging" },
  { rule: "funding_plus_hiring", a: "funding", b: "hiring" },
  // Phase 3.1 — cross-module pairs: competitive × market/paid streams.
  { rule: "market_entry_plus_pricing", a: "market_entry", b: "pricing" },
  { rule: "platform_shift_plus_launch", a: "platform_shift", b: "launch" },
  { rule: "reviews_plus_messaging", a: "reviews", b: "messaging" },
];

/** Phase 3.1 — triple rules: every leg present in the window. */
const TRIPLE_RULES: Array<{ rule: string; legs: string[][] }> = [
  {
    rule: "expansion_move",
    legs: [["funding"], ["hiring"], ["pricing", "packaging"]],
  },
];

export const HIGH_SEVERITY_CLUSTER_MIN = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO-8601 week label, e.g. 2026-W27 — the correlation dedup window. */
export function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * insights.dedupKey for rule-triggered correlations. The on-insert grouper
 * (signal.ground) and the fusion scan can both nominate the same correlation
 * in the same week — they MUST mint the identical key or the dedup check and
 * the DB unique constraint can't see each other's inserts and the org gets
 * the insight twice (plus double verifier spend).
 */
export function correlationDedupKey(rule: string, entityId: string, at: Date): string {
  return `corr:${rule}:${entityId}:${isoWeek(at)}`;
}

/** Run on signal insert over the entity's trailing 30-day window. */
export function findInsightCandidates(
  windowSignals: SignalLite[],
): InsightCandidate[] {
  const byEntity = new Map<string, SignalLite[]>();
  for (const s of windowSignals) {
    byEntity.set(s.entityId, [...(byEntity.get(s.entityId) ?? []), s]);
  }

  const candidates: InsightCandidate[] = [];
  for (const [entityId, signals] of byEntity) {
    for (const { rule, a, b } of PAIR_RULES) {
      const inA = signals.filter((s) => s.category === a);
      const inB = signals.filter((s) => s.category === b);
      if (inA.length > 0 && inB.length > 0) {
        candidates.push({
          rule,
          entityId,
          signalIds: [...inA, ...inB].map((s) => s.id),
        });
      }
    }

    for (const { rule, legs } of TRIPLE_RULES) {
      const matched = legs.map((cats) =>
        signals.filter((s) => cats.includes(s.category)),
      );
      if (matched.every((leg) => leg.length > 0)) {
        candidates.push({
          rule,
          entityId,
          signalIds: [...new Set(matched.flat().map((s) => s.id))],
        });
      }
    }

    const highs = signals.filter(
      (s) => s.severity === "high" || s.severity === "critical",
    );
    if (highs.length >= HIGH_SEVERITY_CLUSTER_MIN) {
      candidates.push({
        rule: "high_severity_cluster",
        entityId,
        signalIds: highs.map((s) => s.id),
      });
    }
  }
  return candidates;
}
