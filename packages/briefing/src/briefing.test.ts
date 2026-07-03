import { describe, expect, test } from "bun:test";

import { confidenceLint, numericCrossCheck } from "./qa";
import { selectForBriefing, type SelectableSignal } from "./select";

const sig = (
  id: string,
  category: string,
  severity: SelectableSignal["severity"],
  grounding = 80,
  carryover = false,
): SelectableSignal => ({ id, category, severity, grounding, carryover });

describe("selection (code, not model)", () => {
  test("budgets cap each section, ranked by severity × grounding", () => {
    const signals = Array.from({ length: 8 }, (_, i) =>
      sig(`p${i}`, "pricing", i < 2 ? "critical" : "high", 100 - i * 10),
    );
    const { sections } = selectForBriefing(signals);
    expect(sections.pricing_packaging).toEqual(["p0", "p1", "p2", "p3"]);
  });

  test("cross-section dedup: a signal leads exactly one section", () => {
    const { sections } = selectForBriefing([
      sig("a", "pricing", "critical"),
      sig("b", "launch", "high"),
      sig("c", "hiring", "high"),
    ]);
    expect(sections.pricing_packaging).toEqual(["a"]);
    expect(sections.launches).toEqual(["b"]);
    expect(sections.top_moves).toEqual(["c"]); // only the unclaimed one
  });

  test("quiet week below threshold; info-only weeks are quiet", () => {
    expect(selectForBriefing([sig("a", "pricing", "notable"), sig("b", "launch", "info")]).quietWeek).toBe(true);
    expect(
      selectForBriefing([
        sig("a", "pricing", "high"),
        sig("b", "launch", "high"),
        sig("c", "hiring", "notable"),
      ]).quietWeek,
    ).toBe(false);
  });
});

describe("QA gate: numeric cross-check", () => {
  const facts = [{ plans: [{ name: "Pro", price: 399, priceText: "$399/mo" }] }];

  test("passes when every number is backed by cited facts", () => {
    expect(numericCrossCheck("Pro dropped to $399.", facts)).toEqual([]);
  });

  test("catches the invented number — the classic LLM crime", () => {
    const issues = numericCrossCheck("Pro dropped to $349, a 30% cut.", facts);
    expect(issues.length).toBeGreaterThanOrEqual(2);
    expect(issues[0]!.detail).toContain("349");
  });

  test("normalizes separators: 1,200 in text matches 1200 in facts", () => {
    expect(
      numericCrossCheck("Scale costs $1,200 now.", [{ price: 1200 }]),
    ).toEqual([]);
  });
});

describe("QA gate: confidence lint", () => {
  test("predictive claim without a marker fails", () => {
    const issues = confidenceLint(["They will likely raise prices next quarter."]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.check).toBe("confidence");
  });

  test("hedged predictive claim passes", () => {
    expect(
      confidenceLint(["They will likely raise prices next quarter (moderate confidence)."]),
    ).toEqual([]);
  });

  test("plain factual statements are untouched", () => {
    expect(confidenceLint(["Pro price changed from $499 to $399."])).toEqual([]);
  });
});
