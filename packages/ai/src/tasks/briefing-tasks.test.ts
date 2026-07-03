import { describe, expect, test } from "bun:test";

import { briefSection } from "./brief-section";
import { execSummary } from "./exec-summary";

describe("brief-section citation enforcement", () => {
  const input = {
    sectionKey: "pricing_packaging" as const,
    periodLabel: "Week of Jun 29",
    orgContext: {
      positioningStatement: "Premium platform",
      priorities: [{ id: "p1", text: "Win enterprise" }],
      segments: ["Enterprise"],
    },
    facts: [
      { ref: "F1", text: "Pro price 499→399", entity: "AskCo", date: null },
    ],
    entityMemory: [],
    qaNotes: [] as string[],
  };

  test("accepts cited blocks", () => {
    const issues = briefSection.validate!(
      {
        blocks: [
          { heading: "AskCo", text: "Cut Pro 20%", refs: ["F1"], ownerRole: null },
        ],
      },
      input,
    );
    expect(issues).toEqual([]);
  });

  test("rejects fabricated refs", () => {
    const issues = briefSection.validate!(
      {
        blocks: [
          { heading: "AskCo", text: "x", refs: ["F4"], ownerRole: null },
        ],
      },
      input,
    );
    expect(issues[0]).toContain("F4");
  });
});

describe("exec-summary ref chain", () => {
  const input = {
    periodLabel: "Week of Jun 29",
    sections: [
      {
        key: "pricing_packaging",
        blocks: [{ text: "AskCo cut Pro 20%", refs: ["F1", "F2"] }],
      },
    ],
  };

  test("bullets may only cite refs carried by section blocks", () => {
    expect(
      execSummary.validate!(
        {
          bullets: [
            { text: "a", refs: ["F1"] },
            { text: "b", refs: ["F2"] },
            { text: "c", refs: ["F1", "F2"] },
          ],
        },
        input,
      ),
    ).toEqual([]);

    const issues = execSummary.validate!(
      {
        bullets: [
          { text: "a", refs: ["F9"] },
          { text: "b", refs: ["F1"] },
          { text: "c", refs: ["F1"] },
        ],
      },
      input,
    );
    expect(issues[0]).toContain("F9");
  });
});
