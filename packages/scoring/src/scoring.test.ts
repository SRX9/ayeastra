import { describe, expect, test } from "bun:test";

import { cosineSimilarity, dedupKey, noveltyFactor } from "./dedup";
import { applyVerdict, DEFAULT_WEIGHT } from "./feedback";
import { findInsightCandidates, type SignalLite } from "./insights";
import { scoreSignal, type ScoringInput } from "./severity";

const base: ScoringInput = {
  materiality: "material",
  sourceKind: "pricing",
  category: "pricing",
  tier: "primary",
  importance: 3,
  grounding: 80,
  noveltyFactor: 1,
  feedbackAdjust: 1,
  confidence: "high",
  hasAttachment: true,
};

describe("severity math (code decides)", () => {
  test("acceptance: same change, two org contexts → different severities", () => {
    // Premium-positioned org with the priority attached: pages someone.
    const affected = scoreSignal(base);
    // Bystander org: watch tier, weak grounding, nothing attached.
    const bystander = scoreSignal({
      ...base,
      tier: "watch",
      grounding: 20,
      hasAttachment: false,
    });
    expect(affected.severity).toBe("critical");
    expect(["notable", "info"]).toContain(bystander.severity);
  });

  test("CRITICAL requires primary + critical category + attachment", () => {
    expect(scoreSignal({ ...base, tier: "secondary", grounding: 100 }).severity).not.toBe("critical");
    const noAttach = scoreSignal({ ...base, hasAttachment: false });
    expect(noAttach.severity).toBe("notable");
    expect(noAttach.capsApplied).toContain("context_neutral_caps_at_notable");
    const wrongCategory = scoreSignal({ ...base, category: "hiring", sourceKind: "careers" });
    expect(wrongCategory.severity).not.toBe("critical");
  });

  test("low confidence caps at NOTABLE — uncertain claims never page", () => {
    const capped = scoreSignal({ ...base, confidence: "low" });
    expect(capped.severity).toBe("notable");
    expect(capped.capsApplied).toContain("low_confidence_caps_at_notable");
  });

  test("context-neutral caps at NOTABLE even with huge raw score", () => {
    const s = scoreSignal({ ...base, grounding: 100, hasAttachment: false });
    expect(s.severity).toBe("notable");
  });

  test("cosmetic changes never rate above INFO for watch-tier entities", () => {
    const s = scoreSignal({
      ...base,
      materiality: "cosmetic",
      tier: "watch",
      grounding: 10,
      hasAttachment: false,
    });
    expect(s.severity).toBe("info");
  });

  test("novelty discounts near-repeats below alert thresholds", () => {
    const fresh = scoreSignal(base);
    const repeat = scoreSignal({ ...base, noveltyFactor: 0.55 });
    expect(fresh.score).toBeGreaterThan(repeat.score);
    expect(repeat.severity).not.toBe("critical");
  });

  test("decomposition exposes every factor — no black boxes", () => {
    const s = scoreSignal(base);
    expect(s.factors).toEqual({
      materialityPoints: 100,
      kindWeight: 1,
      entityWeight: 1,
      groundingFactor: 0.9,
      noveltyFactor: 1,
      feedbackAdjust: 1,
    });
    expect(s.score).toBe(90);
  });

  test("feedbackAdjust and importance are clamped to spec ranges", () => {
    const s = scoreSignal({ ...base, feedbackAdjust: 9, importance: 100 });
    expect(s.factors.feedbackAdjust).toBe(1.5);
    expect(s.factors.entityWeight).toBe(1.25);
  });
});

describe("dedup & novelty", () => {
  test("dedup key is stable across key ordering", () => {
    const a = dedupKey("e1", "pricing", { plan: "Pro", price: 399 });
    const b = dedupKey("e1", "pricing", { price: 399, plan: "Pro" });
    expect(a).toBe(b);
  });

  test("different facts → different keys", () => {
    expect(dedupKey("e1", "pricing", { price: 399 })).not.toBe(
      dedupKey("e1", "pricing", { price: 499 }),
    );
  });

  test("cosine similarity identifies identical and orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  test("novelty: new=1, follow-up gate=0, in between discounts", () => {
    expect(noveltyFactor(null)).toBe(1);
    expect(noveltyFactor(0.95)).toBe(0);
    expect(noveltyFactor(0.46)).toBeCloseTo(0.75, 2);
  });
});

describe("feedback loop v1", () => {
  test("replayed negative sequence moves the multiplier exactly as specified", () => {
    let state = DEFAULT_WEIGHT;
    const t1 = applyVerdict(state, "not_useful");
    expect(t1.multiplier).toBeCloseTo(0.9);
    const t2 = applyVerdict(t1, "already_knew");
    expect(t2.multiplier).toBeCloseTo(0.81);
    const t3 = applyVerdict(t2, "not_useful");
    expect(t3.multiplier).toBeCloseTo(0.729);
    expect(t3.offerMute).toBe(true); // third in a row → one-tap mute offer
    expect(t2.offerMute).toBe(false);
  });

  test("floor and ceiling hold", () => {
    let down = DEFAULT_WEIGHT;
    for (let i = 0; i < 20; i++) down = applyVerdict(down, "not_useful");
    expect(down.multiplier).toBe(0.5);
    let up = DEFAULT_WEIGHT;
    for (let i = 0; i < 20; i++) up = applyVerdict(up, "useful");
    expect(up.multiplier).toBe(1.5);
  });

  test("useful resets the negative streak", () => {
    const twoDown = applyVerdict(applyVerdict(DEFAULT_WEIGHT, "not_useful"), "not_useful");
    const rescued = applyVerdict(twoDown, "useful");
    expect(rescued.consecutiveNegative).toBe(0);
  });

  test("wrong never changes weights but always files a review item", () => {
    const t = applyVerdict({ multiplier: 0.9, consecutiveNegative: 2 }, "wrong");
    expect(t.multiplier).toBe(0.9);
    expect(t.consecutiveNegative).toBe(2);
    expect(t.fileReviewItem).toBe(true);
  });
});

describe("insight rule groupers", () => {
  const sig = (id: string, entityId: string, category: string, severity: SignalLite["severity"] = "notable"): SignalLite => ({
    id,
    entityId,
    category,
    severity,
    createdAt: new Date(),
  });

  test("pricing + hiring on one entity nominates a candidate", () => {
    const c = findInsightCandidates([sig("1", "e1", "pricing"), sig("2", "e1", "hiring")]);
    expect(c).toContainEqual({ rule: "pricing_plus_hiring", entityId: "e1", signalIds: ["1", "2"] });
  });

  test("pairs across different entities do NOT correlate", () => {
    const c = findInsightCandidates([sig("1", "e1", "pricing"), sig("2", "e2", "hiring")]);
    expect(c).toHaveLength(0);
  });

  test("≥3 high-severity signals on one entity cluster", () => {
    const c = findInsightCandidates([
      sig("1", "e1", "pricing", "high"),
      sig("2", "e1", "launch", "critical"),
      sig("3", "e1", "messaging", "high"),
    ]);
    expect(c.some((x) => x.rule === "high_severity_cluster")).toBe(true);
  });

  test("quiet window → zero candidates (better zero than stretched)", () => {
    expect(findInsightCandidates([sig("1", "e1", "docs" as never, "info")])).toHaveLength(0);
  });
});
