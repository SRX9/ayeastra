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
];

export const HIGH_SEVERITY_CLUSTER_MIN = 3;

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
