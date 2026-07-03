import { describe, expect, test } from "bun:test";

import {
  orchestrateBriefing,
  type GatheredSignal,
  type OrchestrateInput,
  type Synth,
} from "./orchestrate";

function signal(over: Partial<GatheredSignal> & { id: string }): GatheredSignal {
  return {
    entityId: "e1",
    entity: "AskCo",
    category: "pricing",
    severity: "high",
    grounding: 80,
    finding: "Cut Pro from $499 to $399",
    whyItMatters: "Undercuts our premium tier",
    evidenceIds: [`ev-${over.id}`],
    sourceUrl: "https://askco.test/pricing",
    date: "2026-06-30",
    extractedFacts: { before: 499, after: 399 },
    priorityAttachments: [{ priorityId: "p1", segment: "Enterprise" }],
    ...over,
  };
}

function baseInput(signals: GatheredSignal[]): OrchestrateInput {
  return {
    kind: "weekly",
    orgName: "Acme",
    periodLabel: "Week of Jun 29",
    webUrl: "https://app.test/briefings/b1",
    signals,
    entityMemory: [{ entity: "AskCo", note: "Second pricing move this quarter" }],
    battlecardChanges: [
      { entity: "AskCo", sectionKey: "pricing", note: "table refreshed", at: "2026-06-30" },
    ],
    coverage: [{ entity: "AskCo", sourceCount: 4 }],
    priorities: [{ id: "p1", text: "Win enterprise" }],
    segments: ["Enterprise"],
  };
}

/** Echo synth: one block per fact, citing it — always QA-clean. */
const goodSynth: Synth = {
  async section({ facts }) {
    return {
      blocks: facts.map((f) => ({
        heading: f.entity,
        text: f.text,
        refs: [f.ref],
        ownerRole: null,
      })),
    };
  },
  async execSummary({ sections }) {
    const first = sections[0]!.blocks[0]!;
    return {
      bullets: [
        { text: first.text, refs: first.refs },
        { text: "second", refs: first.refs },
        { text: "third", refs: first.refs },
      ],
    };
  },
};

describe("orchestrateBriefing", () => {
  const signals = [
    signal({ id: "s1" }),
    signal({ id: "s2", category: "launch", finding: "Launched Webhooks 2.0", extractedFacts: { title: "Webhooks 2.0" } }),
    signal({ id: "s3", category: "hiring", severity: "notable", finding: "Hired 4 enterprise AEs", extractedFacts: { count: 4 } }),
  ];

  test("happy path: sections, exec last, impact map, citations resolve", async () => {
    const { ast, drops, quietWeek } = await orchestrateBriefing(
      baseInput(signals),
      goodSynth,
    );
    expect(drops).toEqual([]);
    expect(quietWeek).toBe(false);
    const keys = ast.sections.map((s) => s.key);
    expect(keys[0]).toBe("exec_summary");
    expect(keys).toContain("pricing_packaging");
    expect(keys).toContain("impact_map");
    expect(keys).toContain("battlecard_updates");
    // Every cited ref resolves in the AST citation map.
    for (const section of ast.sections) {
      for (const block of section.blocks) {
        for (const ref of block.refs) {
          expect(ast.citations[ref]).toBeDefined();
        }
      }
    }
    expect(ast.citations.F1!.sourceUrl).toBe("https://askco.test/pricing");
  });

  test("QA gate: invented number → regenerate once with notes → drop on repeat", async () => {
    const attempts: string[][] = [];
    const badSynth: Synth = {
      async section({ facts, qaNotes, sectionKey }) {
        if (sectionKey === "pricing_packaging") {
          attempts.push(qaNotes);
          return {
            blocks: [
              // 777 appears in no cited extracted_facts — the classic crime.
              { heading: "AskCo", text: "Cut Pro to $777", refs: [facts[0]!.ref], ownerRole: null },
            ],
          };
        }
        return goodSynth.section({ facts, qaNotes, sectionKey, entityMemory: [] } as never);
      },
      execSummary: goodSynth.execSummary,
    };

    const { ast, drops } = await orchestrateBriefing(baseInput(signals), badSynth);
    // Regenerated exactly once, with the numeric errors appended.
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toEqual([]);
    expect(attempts[1]!.join(" ")).toContain("777");
    // Section dropped; the rest of the briefing still delivers.
    expect(drops.map((d) => d.key)).toEqual(["pricing_packaging"]);
    expect(ast.sections.map((s) => s.key)).not.toContain("pricing_packaging");
    expect(ast.sections.map((s) => s.key)).toContain("launches");
  });

  test("killed section synth → dropped, not fatal (acceptance)", async () => {
    const dyingSynth: Synth = {
      async section(input) {
        if (input.sectionKey === "launches") throw new Error("boom");
        return goodSynth.section(input);
      },
      execSummary: goodSynth.execSummary,
    };
    const { ast, drops } = await orchestrateBriefing(baseInput(signals), dyingSynth);
    expect(drops.map((d) => d.key)).toEqual(["launches"]);
    expect(ast.sections.length).toBeGreaterThan(2);
  });

  test("quiet week: below threshold → flag set, coverage proof included", async () => {
    const { ast, quietWeek } = await orchestrateBriefing(
      baseInput([signal({ id: "s1" })]),
      goodSynth,
    );
    expect(quietWeek).toBe(true);
    expect(ast.quietWeek).toBe(true);
    expect(ast.sections.map((s) => s.key)).toContain("coverage");
  });

  test("connected intelligence (3.1): prominent slot, continued citations, deep links", async () => {
    const { ast } = await orchestrateBriefing(
      {
        ...baseInput(signals),
        insights: [
          {
            id: "ins-1",
            entity: "AskCo",
            kind: "pattern",
            pattern: "Expansion move under way",
            analysis: "Funding, hiring, and a pricing repackage form one coherent expansion story.",
            forwardLook: "A launch or market entry is likely within the pattern's horizon.",
            confidence: "moderate",
            confidenceNotes: "A hiring freeze or pricing rollback would invalidate this.",
            trackRecord: "Preceded 4 of 5 observed outcomes in the archive, typically 41–68 days ahead.",
            corroboration: "Your team acted on this pattern once; 1 outcome logged.",
            signalIds: ["s1", "s2"],
            evidence: [
              { evidenceId: "ev-x", sourceUrl: "https://askco.test/blog", fetchedAt: "2026-06-28" },
              { evidenceId: "ev-y", sourceUrl: "https://askco.test/pricing", fetchedAt: "2026-06-30" },
            ],
          },
        ],
      },
      goodSynth,
    );

    const keys = ast.sections.map((s) => s.key);
    // Rare and prominent: directly under the exec summary.
    expect(keys.indexOf("connected_intelligence")).toBe(keys.indexOf("exec_summary") + 1);

    const section = ast.sections.find((s) => s.key === "connected_intelligence")!;
    expect(section.title).toBe("Connected intelligence");
    const block = section.blocks[0]!;
    expect(block.heading).toBe("AskCo: Expansion move under way");
    expect(block.insightId).toBe("ins-1");
    expect(block.signalIds).toEqual(["s1", "s2"]);
    expect(block.text).toContain("moderate confidence");
    expect(block.text).toContain("Track record: Preceded 4 of 5");
    expect(block.text).toContain("What would change this:");
    // F-numbering continues past the signal refs and resolves in the map.
    expect(block.refs).toHaveLength(2);
    for (const ref of block.refs) {
      expect(ast.citations[ref]).toBeDefined();
    }
    expect(ast.citations[block.refs[0]!]!.evidenceId).toBe("ev-x");
    // No collision with signal citations.
    expect(new Set(Object.keys(ast.citations)).size).toBe(
      Object.keys(ast.citations).length,
    );
  });

  test("no fusion insights → no connected intelligence section (honest omission)", async () => {
    const { ast } = await orchestrateBriefing(baseInput(signals), goodSynth);
    expect(ast.sections.map((s) => s.key)).not.toContain("connected_intelligence");
  });
});
