import { describe, expect, test } from "bun:test";

import type { GatheredSignal, Synth } from "@ayeastra/briefing";

import { assembleBoard, deriveLandscapeShifts, derivePatternOutlook } from "./board";
import { workflowEntitled } from "./entitlements";
import {
  canTransitionMission,
  missionRelevant,
  parseMissionBrief,
  parseWatchSpec,
} from "./missions";
import {
  parseReportLayout,
  renderReportMarkdown,
  ReportLayoutError,
} from "./reports";
import { MISSION_TEMPLATES, templateByKey } from "./templates";

describe("mission templates", () => {
  test("three templates, each seeding a full lens", () => {
    expect(MISSION_TEMPLATES).toHaveLength(3);
    for (const t of MISSION_TEMPLATES) {
      expect(t.categories.length).toBeGreaterThan(0);
      expect(t.lookFor.length).toBeGreaterThan(0);
      expect(t.goal("PayBridge")).toContain("PayBridge");
    }
    expect(templateByKey("defend_competitor")!.title).toContain("Defend");
    expect(templateByKey("nope")).toBeNull();
  });
});

describe("watch spec + mission relevance", () => {
  const spec = parseWatchSpec({
    v: 1,
    categories: ["pricing", "launch"],
    lookFor: ["Enterprise tier changes"],
    leadingIndicators: ["Sales hiring"],
  });

  test("spec parses; garbage is null, never trusted", () => {
    expect(spec).not.toBeNull();
    expect(parseWatchSpec({ v: 2 })).toBeNull();
    expect(parseWatchSpec(null)).toBeNull();
  });

  const lens = { entityIds: ["e1"], watchSpec: spec, priorityId: "p1" };

  test("entity + watched category → relevant", () => {
    expect(
      missionRelevant(lens, { entityId: "e1", category: "pricing", priorityAttachments: null }),
    ).toBe(true);
    expect(
      missionRelevant(lens, { entityId: "e1", category: "hiring", priorityAttachments: null }),
    ).toBe(false);
    expect(
      missionRelevant(lens, { entityId: "e2", category: "pricing", priorityAttachments: null }),
    ).toBe(false);
  });

  test("priority attachment reaches across entities (grounding link)", () => {
    expect(
      missionRelevant(lens, {
        entityId: "e2",
        category: "hiring",
        priorityAttachments: [{ priorityId: "p1" }],
      }),
    ).toBe(true);
    expect(
      missionRelevant(lens, {
        entityId: "e2",
        category: "hiring",
        priorityAttachments: [{ priorityId: "other" }],
      }),
    ).toBe(false);
  });

  test("no spec = all categories on mission entities", () => {
    expect(
      missionRelevant(
        { ...lens, watchSpec: null },
        { entityId: "e1", category: "regulatory", priorityAttachments: null },
      ),
    ).toBe(true);
  });

  test("lifecycle: draft → active → closed only", () => {
    expect(canTransitionMission("draft", "active")).toBe(true);
    expect(canTransitionMission("active", "closed")).toBe(true);
    expect(canTransitionMission("closed", "active")).toBe(false);
    expect(canTransitionMission("draft", "closed")).toBe(false);
  });

  test("stored briefs parse or are ignored", () => {
    expect(parseMissionBrief(null)).toBeNull();
    expect(
      parseMissionBrief({
        v: 1,
        situation: { text: "s", refs: ["F1"] },
        developments: [],
        outlook: { text: "o", confidence: "moderate" },
        citations: { F1: { evidenceId: "ev1", sourceUrl: null } },
        updatedAt: "2026-07-01T00:00:00.000Z",
      }),
    ).not.toBeNull();
  });
});

describe("board mode", () => {
  test("landscape shifts are counted from the archive, QoQ", () => {
    const blocks = deriveLandscapeShifts({
      thisQuarter: [
        { entity: "PayBridge", category: "pricing" },
        { entity: "PayBridge", category: "pricing" },
        { entity: "PayBridge", category: "launch" },
        { entity: "LedgerLy", category: "hiring" },
      ],
      lastQuarter: [{ entity: "PayBridge", category: "pricing" }],
    });
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.heading).toBe("LedgerLy");
    expect(blocks[1]!.heading).toBe("PayBridge");
    expect(blocks[1]!.text).toBe("pricing ×2 (was 1) · launch ×1 (was 0)");
  });

  test("pattern outlook renders only VALIDATED patterns, from validation data", () => {
    const blocks = derivePatternOutlook([
      {
        id: "1",
        scope: "global",
        entityId: null,
        claim: "Pricing precedes launch",
        triggerSpec: {},
        outcomeSpec: {},
        status: "validated",
        source: "analyst",
        validation: {
          backtest: {
            n: 5,
            hits: 4,
            misses: 1,
            unresolved: 0,
            precision: 0.8,
            wilsonLcb: 0.51,
            leadTimeDays: { p25: 41, p50: 55, p75: 68, n: 4 },
            archiveStart: "",
            archiveEnd: "",
            ranAt: "",
          },
        },
      },
      {
        id: "2",
        scope: "global",
        entityId: null,
        claim: "Never shown",
        triggerSpec: {},
        outcomeSpec: {},
        status: "candidate",
        source: "auto",
        validation: null,
      },
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.heading).toBe("Pricing precedes launch");
    expect(blocks[0]!.text).toContain("4 of 5");
  });

  const gathered = (id: string, severity: GatheredSignal["severity"]): GatheredSignal => ({
    id,
    entityId: "e1",
    entity: "PayBridge",
    category: "pricing",
    severity,
    grounding: 80,
    finding: `Move ${id}`,
    whyItMatters: "Matters",
    evidenceIds: [`ev-${id}`],
    sourceUrl: "https://x.test",
    date: "2026-06-01",
    extractedFacts: null,
    priorityAttachments: null,
  });

  const echoSynth: Synth = {
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
      const b = sections[0]!.blocks[0]!;
      return {
        bullets: [
          { text: b.text, refs: b.refs },
          { text: "two", refs: b.refs },
          { text: "three", refs: b.refs },
        ],
      };
    },
  };

  test("assembleBoard: kind board, doc section order, citations resolve", async () => {
    const { ast, drops } = await assembleBoard(
      {
        orgName: "Acme",
        periodLabel: "2026 Q2",
        webUrl: "https://app.test/board",
        signals: [gathered("s1", "critical"), gathered("s2", "high")],
        landscape: {
          thisQuarter: [{ entity: "PayBridge", category: "pricing" }],
          lastQuarter: [],
        },
        recap: {
          quarterLabel: "2026 Q2",
          actions: [{ description: "Update battlecard", status: "done", ownerName: null }],
          outcomes: [{ kpi: "Won 2 deals" }],
          wouldHaveMissed: ["Caught the repricing early"],
        },
        patterns: [],
        coverage: [{ entity: "PayBridge", sourceCount: 4 }],
      },
      echoSynth,
    );
    expect(drops).toEqual([]);
    expect(ast.kind).toBe("board");
    const keys = ast.sections.map((s) => s.key);
    expect(keys).toEqual([
      "exec_summary",
      "landscape_shifts",
      "strategic_highlights",
      "value_recap",
      "coverage",
    ]);
    for (const section of ast.sections) {
      for (const block of section.blocks) {
        for (const ref of block.refs) expect(ast.citations[ref]).toBeDefined();
      }
    }
  });

  test("assembleBoard QA gate: invented numbers drop the section, artifact survives", async () => {
    const badSynth: Synth = {
      async section({ facts }) {
        return {
          blocks: [
            { heading: "X", text: "Revenue grew 999%", refs: [facts[0]!.ref], ownerRole: null },
          ],
        };
      },
      execSummary: echoSynth.execSummary,
    };
    const { ast, drops } = await assembleBoard(
      {
        orgName: "Acme",
        periodLabel: "2026 Q2",
        webUrl: "",
        signals: [gathered("s1", "critical")],
        landscape: { thisQuarter: [], lastQuarter: [] },
        recap: { quarterLabel: "2026 Q2", actions: [], outcomes: [], wouldHaveMissed: [] },
        patterns: [],
        coverage: [{ entity: "PayBridge", sourceCount: 4 }],
      },
      badSynth,
    );
    expect(drops.map((d) => d.key)).toEqual(["strategic_highlights"]);
    expect(ast.sections.map((s) => s.key)).not.toContain("strategic_highlights");
    expect(ast.sections.map((s) => s.key)).toContain("coverage"); // honesty block survives
  });
});

describe("reports", () => {
  test("layout parses; unknown kinds and empty layouts rejected", () => {
    const layout = parseReportLayout({
      v: 1,
      blocks: [
        { kind: "signal_digest", categories: ["pricing"], days: 30, limit: 5 },
        { kind: "insight_block", limit: 3 },
      ],
    });
    expect(layout.blocks).toHaveLength(2);
    expect(() => parseReportLayout({ v: 1, blocks: [] })).toThrow(ReportLayoutError);
    expect(() =>
      parseReportLayout({ v: 1, blocks: [{ kind: "sql_injection" }] }),
    ).toThrow(ReportLayoutError);
  });

  test("markdown export keeps evidence chips on every line", () => {
    const md = renderReportMarkdown({
      title: "PayBridge quarterly",
      generatedAt: "2026-07-03",
      evidenceBaseUrl: "https://app.test/evidence",
      blocks: [
        {
          title: "Signal digest",
          lines: [
            { text: "Cut Pro from $499 to $399", evidenceId: "ev1" },
            { text: "Derived count line", evidenceId: null },
          ],
        },
        { title: "Pricing history", lines: [] },
      ],
    });
    expect(md).toContain("# PayBridge quarterly");
    expect(md).toContain("- Cut Pro from $499 to $399 ([evidence](https://app.test/evidence/ev1))");
    expect(md).toContain("- Derived count line\n");
    expect(md).toContain("_Nothing in this window._");
  });
});

describe("entitlements", () => {
  test("workflow layer is Business/Enterprise only", () => {
    expect(workflowEntitled("business")).toBe(true);
    expect(workflowEntitled("enterprise")).toBe(true);
    expect(workflowEntitled("team")).toBe(false);
    expect(workflowEntitled(null)).toBe(false);
    expect(workflowEntitled(undefined)).toBe(false);
  });
});
