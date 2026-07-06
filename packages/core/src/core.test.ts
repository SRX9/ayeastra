import { describe, expect, test } from "bun:test";

import { BusinessContext } from "./business-context";

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
