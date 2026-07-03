import { describe, expect, test } from "bun:test";

import { BusinessContext } from "./business-context";
import { INTERVIEW_STAGES, mergeSlice, missingForActivation, nextStage } from "./interview";

const now = new Date().toISOString();

describe("BusinessContext schema", () => {
  test("accepts a complete context", () => {
    const parsed = BusinessContext.safeParse({
      company: { name: "Acme", domain: "acme.com", oneLiner: "x", stage: "seed", market: "martech" },
      positioning: { statement: "s", differentiators: ["d"], pricingPosture: "premium", talkTracks: [] },
      segments: [{ name: "mid-market", description: "d", priority: 1 }],
      competitors: [
        { entityId: "0197b7e2-1111-7000-8000-000000000000", tier: "primary", ourAdvantage: null, theirAdvantage: null, notes: null },
      ],
      priorities: [{ id: "p1", text: "win mid-market", rank: 1, addedAt: now, status: "active" }],
      concerns: [{ text: "pricing pressure", addedAt: now }],
      delivery: {
        briefingDay: "monday",
        timezone: "America/New_York",
        channels: { email: ["a@acme.com"], slackWebhook: null },
        alertRouting: { critical: ["slack", "email"], high: ["slack"], notable: [] },
      },
    });
    expect(parsed.success).toBe(true);
  });

  test("rejects invalid pricing posture and bad segment priority", () => {
    expect(
      BusinessContext.shape.positioning.safeParse({
        statement: "s",
        differentiators: [],
        pricingPosture: "cheap",
        talkTracks: [],
      }).success,
    ).toBe(false);
    expect(
      BusinessContext.shape.segments.element.safeParse({ name: "x", description: "d", priority: 4 }).success,
    ).toBe(false);
  });
});

describe("interview reducer", () => {
  test("stages advance in order and end", () => {
    expect(INTERVIEW_STAGES[0]).toBe("company");
    expect(nextStage("company")).toBe("competitors");
    expect(nextStage("delivery")).toBeNull();
  });

  test("a rambling answer fills multiple slices without erasing earlier ones", () => {
    const afterStage2 = mergeSlice(
      {},
      {
        competitors: [
          { entityId: "0197b7e2-1111-7000-8000-000000000001", tier: "primary", ourAdvantage: null, theirAdvantage: null, notes: null },
        ],
      },
    );
    const afterStage4 = mergeSlice(afterStage2, {
      priorities: [{ id: "p1", text: "Win mid-market", rank: 1, addedAt: now, status: "active" }],
      competitors: [
        { entityId: "0197b7e2-1111-7000-8000-000000000002", tier: "watch", ourAdvantage: null, theirAdvantage: null, notes: null },
      ],
    });
    expect(afterStage4.competitors).toHaveLength(2);
    expect(afterStage4.priorities).toHaveLength(1);
  });

  test("re-mentioning a competitor updates instead of duplicating", () => {
    const id = "0197b7e2-1111-7000-8000-000000000001";
    const draft = mergeSlice(
      { competitors: [{ entityId: id, tier: "watch", ourAdvantage: null, theirAdvantage: null, notes: null }] },
      { competitors: [{ entityId: id, tier: "primary", ourAdvantage: "speed", theirAdvantage: null, notes: null }] },
    );
    expect(draft.competitors).toHaveLength(1);
    expect(draft.competitors![0]!.tier).toBe("primary");
  });

  test("priorities dedupe case-insensitively by text", () => {
    const draft = mergeSlice(
      { priorities: [{ id: "p1", text: "Win Mid-Market", rank: 1, addedAt: now, status: "active" }] },
      { priorities: [{ id: "p2", text: "win mid-market", rank: 2, addedAt: now, status: "active" }] },
    );
    expect(draft.priorities).toHaveLength(1);
  });

  test("missingForActivation lists skipped stages; complete draft is ready", () => {
    expect(missingForActivation({})).toEqual([
      "company",
      "positioning",
      "competitors",
      "priorities",
      "delivery",
    ]);
  });
});
