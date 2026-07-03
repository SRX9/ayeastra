import { describe, expect, test } from "bun:test";

import { assembleBriefing, type BriefingAst } from "./ast";
import {
  deriveBattlecardUpdates,
  deriveCoverage,
  deriveImpactMap,
} from "./derive";
import { renderEmailHtml, renderEmailText } from "./render-email";
import { renderSlackDigest } from "./render-slack";

function fixtureAst(): BriefingAst {
  return assembleBriefing({
    kind: "weekly",
    periodLabel: "Week of Jun 29, 2026",
    orgName: "Acme Corp",
    quietWeek: false,
    webUrl: "https://app.ayeastra.com/briefings/b1",
    citations: {
      F1: {
        evidenceId: "ev-1",
        sourceUrl: "https://askco.test/pricing",
        fetchedAt: "2026-06-30",
      },
      F2: { evidenceId: "ev-2", sourceUrl: null, fetchedAt: null },
    },
    sections: {
      // Deliberately out of reading order — assemble must fix it.
      top_moves: [
        {
          heading: "AskCo",
          text: "Cut Pro plan 20% & <script>alert(1)</script>",
          refs: ["F1"],
          ownerRole: null,
        },
      ],
      exec_summary: [
        { heading: null, text: "AskCo cut Pro pricing 20%", refs: ["F1"], ownerRole: null },
        { heading: null, text: "Two enterprise AE roles added", refs: ["F2"], ownerRole: null },
        { heading: null, text: "No messaging shifts", refs: ["F1"], ownerRole: null },
      ],
      recommended_actions: [
        {
          heading: null,
          text: "Update the AskCo battlecard pricing table",
          refs: ["F1"],
          ownerRole: "PMM",
        },
      ],
      launches: [], // empty → dropped, not padded
    },
  });
}

describe("assembleBriefing", () => {
  test("orders sections canonically and drops empty ones", () => {
    const ast = fixtureAst();
    expect(ast.sections.map((s) => s.key)).toEqual([
      "exec_summary",
      "top_moves",
      "recommended_actions",
    ]);
  });
});

describe("derived sections", () => {
  const signals = [
    {
      id: "s1",
      entity: "AskCo",
      finding: "Cut Pro 20%",
      priorityAttachments: [{ priorityId: "p1", segment: "Enterprise" }],
    },
    { id: "s2", entity: "OtherCo", finding: "New SDK", priorityAttachments: null },
  ];

  test("impact map: hits attach, untouched priorities say so honestly", () => {
    const blocks = deriveImpactMap(
      signals,
      [
        { id: "p1", text: "Win enterprise" },
        { id: "p2", text: "Ship EU region" },
      ],
      ["Enterprise", "SMB"],
    );
    expect(blocks).toHaveLength(3); // p1, p2, Enterprise (SMB untouched → absent)
    expect(blocks[0]!.text).toContain("AskCo");
    expect(blocks[0]!.signalIds).toEqual(["s1"]);
    expect(blocks[1]!.text).toContain("No competitive pressure");
    expect(blocks[2]!.heading).toBe("Segment: Enterprise");
  });

  test("battlecard updates group by entity; coverage lists sources", () => {
    const cards = deriveBattlecardUpdates([
      { entity: "AskCo", sectionKey: "pricing", note: "table refreshed", at: "2026-06-30" },
      { entity: "AskCo", sectionKey: "recent_moves", note: "2 added", at: "2026-07-01" },
    ]);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.text).toContain("pricing");
    expect(cards[0]!.text).toContain("recent_moves");

    expect(deriveCoverage([{ entity: "AskCo", sourceCount: 4 }])[0]!.text).toBe(
      "AskCo (4 sources)",
    );
    expect(deriveCoverage([])).toEqual([]);
  });
});

describe("slack digest", () => {
  test("is a digest: header, exec bullets, top moves, one link out", () => {
    const { blocks } = renderSlackDigest(fixtureAst()) as { blocks: any[] };
    expect(blocks[0].type).toBe("header");
    const texts = JSON.stringify(blocks);
    expect(texts).toContain("AskCo cut Pro pricing 20%");
    expect(texts).toContain("Cut Pro plan 20%");
    expect(texts).not.toContain("battlecard pricing table"); // full content stays in web/email
    const buttons = blocks.filter((b) => b.type === "actions");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].elements[0].url).toBe("https://app.ayeastra.com/briefings/b1");
  });

  test("truncates over-limit text under Slack's 3000-char cap", () => {
    const ast = fixtureAst();
    ast.sections[1]!.blocks[0]!.text = "x".repeat(5000);
    const { blocks } = renderSlackDigest(ast) as { blocks: any[] };
    for (const b of blocks) {
      const t = b.text?.text ?? "";
      expect(t.length).toBeLessThanOrEqual(3000);
    }
  });
});

describe("email render", () => {
  test("full content, escaped, citations link to sources", () => {
    const html = renderEmailHtml(fixtureAst());
    expect(html).toContain("Executive summary");
    expect(html).toContain("Recommended actions");
    expect(html).toContain("suggested owner: PMM");
    expect(html).toContain('href="https://askco.test/pricing"');
    expect(html).not.toContain("<script>"); // escaped
    expect(html).toContain("&lt;script&gt;");
  });

  test("plaintext twin carries every section and the web link", () => {
    const text = renderEmailText(fixtureAst());
    expect(text).toContain("EXECUTIVE SUMMARY");
    expect(text).toContain("[F1]");
    expect(text).toContain("https://app.ayeastra.com/briefings/b1");
  });

  test("quiet week is framed explicitly, never padded", () => {
    const ast = { ...fixtureAst(), quietWeek: true };
    expect(renderEmailHtml(ast)).toContain("Quiet week");
    const slack = JSON.stringify(renderSlackDigest(ast));
    expect(slack).toContain("quiet week");
  });
});
