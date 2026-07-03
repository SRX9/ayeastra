import { describe, expect, test } from "bun:test";

import {
  alertEligible,
  correlationDedupKey,
  type FusionCandidate,
  governCandidates,
  MAX_INSIGHTS_PER_ORG_PER_WEEK,
  MAX_VERIFY_PER_ORG_PER_DAY,
  planScanCandidates,
  rankCandidates,
  renderDeviationStats,
} from "./governor";
import { DAY_MS, EPOCH_UTC } from "./streams";

function cand(partial: Partial<FusionCandidate>): FusionCandidate {
  return {
    kind: "correlation",
    entityId: "e1",
    dedupKey: "corr:x:e1:0",
    tier: "primary",
    severityMass: 4,
    latestEventAt: new Date(EPOCH_UTC),
    signalIds: [],
    hasPriorityAttachment: false,
    hypothesis: "h",
    ...partial,
  };
}

describe("rankCandidates", () => {
  test("pattern > deviation > correlation, then tier, mass, recency", () => {
    const ranked = rankCandidates([
      cand({ dedupKey: "corr:1", kind: "correlation", severityMass: 12 }),
      cand({ dedupKey: "pat:1", kind: "pattern", tier: "watch", severityMass: 0 }),
      cand({ dedupKey: "dev:1", kind: "deviation" }),
      cand({ dedupKey: "dev:2", kind: "deviation", tier: "secondary" }),
    ]);
    expect(ranked.map((c) => c.dedupKey)).toEqual([
      "pat:1",
      "dev:1",
      "dev:2",
      "corr:1",
    ]);
  });

  test("total order: dedupKey breaks exact ties (deterministic)", () => {
    const a = cand({ dedupKey: "corr:a" });
    const b = cand({ dedupKey: "corr:b" });
    expect(rankCandidates([b, a]).map((c) => c.dedupKey)).toEqual([
      "corr:a",
      "corr:b",
    ]);
  });
});

describe("governCandidates", () => {
  const ranked = rankCandidates([
    cand({ dedupKey: "pat:1", kind: "pattern" }),
    cand({ dedupKey: "dev:1", kind: "deviation" }),
    cand({ dedupKey: "corr:1" }),
    cand({ dedupKey: "corr:2" }),
  ]);

  test("weekly insight cap bounds the batch", () => {
    const out = governCandidates({
      ranked,
      existingDedupKeys: new Set(),
      insightsThisWeek: MAX_INSIGHTS_PER_ORG_PER_WEEK - 1,
      verifiedToday: 0,
    });
    expect(out.map((c) => c.dedupKey)).toEqual(["pat:1"]);
  });

  test("daily verify budget is the cost gate before the heavy model", () => {
    const out = governCandidates({
      ranked,
      existingDedupKeys: new Set(),
      insightsThisWeek: 0,
      verifiedToday: MAX_VERIFY_PER_ORG_PER_DAY - 1,
    });
    expect(out).toHaveLength(1);
  });

  test("already-covered dedup keys are suppressed, not re-verified", () => {
    const out = governCandidates({
      ranked,
      existingDedupKeys: new Set(["pat:1", "dev:1"]),
      insightsThisWeek: 0,
      verifiedToday: 0,
    });
    expect(out.map((c) => c.dedupKey)).toEqual(["corr:1", "corr:2"]);
  });

  test("exhausted budgets yield nothing", () => {
    expect(
      governCandidates({
        ranked,
        existingDedupKeys: new Set(),
        insightsThisWeek: MAX_INSIGHTS_PER_ORG_PER_WEEK,
        verifiedToday: 0,
      }),
    ).toEqual([]);
  });
});

describe("alertEligible — the CRITICAL-alert truth table", () => {
  const base = {
    kind: "pattern" as const,
    patternStatus: "validated" as string | null,
    tier: "primary" as const,
    hasPriorityAttachment: true,
  };

  test("only validated pattern × primary tier × priority attachment pages", () => {
    expect(alertEligible(base)).toBe(true);
    expect(alertEligible({ ...base, kind: "deviation" })).toBe(false);
    expect(alertEligible({ ...base, kind: "correlation" })).toBe(false);
    expect(alertEligible({ ...base, patternStatus: "candidate" })).toBe(false);
    expect(alertEligible({ ...base, patternStatus: null })).toBe(false);
    expect(alertEligible({ ...base, tier: "secondary" })).toBe(false);
    expect(alertEligible({ ...base, tier: "watch" })).toBe(false);
    expect(alertEligible({ ...base, hasPriorityAttachment: false })).toBe(false);
  });
});

describe("dedup keys", () => {
  test("correlation key is per rule × entity × week", () => {
    const monday = new Date(EPOCH_UTC + 70 * DAY_MS); // week 10
    expect(correlationDedupKey("expansion_move", "e1", monday)).toBe(
      "corr:expansion_move:e1:10",
    );
  });
});

describe("planScanCandidates — acceptance #2 end-to-end", () => {
  const day = new Date(EPOCH_UTC + 100 * DAY_MS);
  const watched = [{ entityId: "e1", tier: "primary" as const }];
  const basePattern = {
    id: "pat-1",
    scope: "global" as const,
    entityId: null,
    claim: "pricing precedes launch",
    triggerSpec: { v: 1, all: [{ categories: ["pricing"], minCount: 1, windowDays: 30 }] },
    outcomeSpec: { v: 1, categories: ["launch"], minCount: 1, horizonDays: 90 },
    source: "analyst" as const,
    validation: null,
  };
  const firing = {
    id: "pred-1",
    patternId: "pat-1",
    entityId: "e1",
    firedAt: new Date(EPOCH_UTC + 99 * DAY_MS),
  };
  const signal = (id: string, category: string, days: number, attach = false) => ({
    id,
    entityId: "e1",
    category,
    severity: "high" as const,
    createdAt: new Date(EPOCH_UTC + days * DAY_MS),
    priorityAttachments: attach ? [{ priorityId: "p1" }] : null,
  });

  test("a CANDIDATE pattern's firing yields no candidate — the gate holds", () => {
    const out = planScanCandidates({
      day,
      watched,
      signals: [],
      deviations: [],
      firings: [firing],
      patterns: [{ ...basePattern, status: "candidate" }],
    });
    expect(out).toEqual([]);
    // Retired likewise.
    expect(
      planScanCandidates({
        day,
        watched,
        signals: [],
        deviations: [],
        firings: [firing],
        patterns: [{ ...basePattern, status: "retired" }],
      }),
    ).toEqual([]);
  });

  test("a VALIDATED pattern's firing becomes an alert-eligible candidate", () => {
    const out = planScanCandidates({
      day,
      watched,
      signals: [signal("s1", "pricing", 95, true)],
      deviations: [],
      firings: [firing],
      patterns: [{ ...basePattern, status: "validated" }],
    });
    expect(out).toHaveLength(1);
    const c = out[0]!;
    expect(c.kind).toBe("pattern");
    expect(c.dedupKey).toBe("pat:pred-1");
    expect(c.signalIds).toEqual(["s1"]);
    expect(c.hasPriorityAttachment).toBe(true);
    expect(c.hypothesis).toBe("pricing precedes launch");
    expect(
      alertEligible({
        kind: c.kind,
        patternStatus: c.patternStatus ?? null,
        tier: c.tier,
        hasPriorityAttachment: c.hasPriorityAttachment,
      }),
    ).toBe(true);
  });

  test("correlations and deviations only ever form on watched entities", () => {
    const out = planScanCandidates({
      day,
      watched, // e1 only
      signals: [
        signal("s1", "pricing", 95),
        signal("s2", "hiring", 96),
        { ...signal("s3", "pricing", 95), entityId: "e2" },
        { ...signal("s4", "hiring", 96), entityId: "e2" },
      ],
      deviations: [
        {
          id: "d1",
          entityId: "e2", // not watched
          category: "launch",
          kind: "burst",
          windowEnd: day,
          observed: 5,
          expected: 1,
          pValue: 0.001,
          sigmaEquiv: 3.1,
        },
      ],
      firings: [],
      patterns: [],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe("correlation");
    expect(out[0]!.rule).toBe("pricing_plus_hiring");
    expect(out[0]!.entityId).toBe("e1");
    expect(out[0]!.severityMass).toBe(6); // two HIGH signals
  });
});

describe("renderDeviationStats", () => {
  test("deterministic narration per kind", () => {
    expect(
      renderDeviationStats({
        id: "d",
        entityId: "e",
        category: "launch",
        kind: "burst",
        windowEnd: new Date(EPOCH_UTC),
        observed: 9,
        expected: 1.14,
        pValue: 0.00042,
        sigmaEquiv: 3.34,
      }),
    ).toBe("9 events in 28 days vs 1.1 expected from baseline (p=0.00042, 3.3σ)");
    expect(
      renderDeviationStats({
        id: "d",
        entityId: "mkt",
        category: "pricing",
        kind: "cohort",
        windowEnd: new Date(EPOCH_UTC),
        observed: 4,
        expected: 0.03,
        pValue: 0.0000012,
        sigmaEquiv: 4.7,
      }),
    ).toBe("4 competitors in the market moved on pricing in the same week (p=0.0000012)");
  });
});
