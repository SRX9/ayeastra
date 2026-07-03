import { describe, expect, test } from "bun:test";

import {
  buildFactSheet,
  refsToEvidenceIds,
  validateCitations,
} from "./evidence";

/**
 * AI-platform acceptance: "a synthesis task cannot persist a claim with a
 * fabricated ref — test proves the validator rejects it."
 */
describe("evidence discipline", () => {
  const sheet = buildFactSheet([
    { text: "Pro plan price changed $499 → $399", evidenceId: "ev-1" },
    { text: "New 'Scale' plan added", evidenceId: "ev-2" },
  ]);

  test("builds stable refs", () => {
    expect(sheet.facts.map((f) => f.ref)).toEqual(["F1", "F2"]);
  });

  test("accepts claims citing real facts", () => {
    expect(
      validateCitations(sheet, [{ label: "finding", refs: ["F1", "F2"] }]),
    ).toEqual([]);
  });

  test("rejects fabricated refs", () => {
    const issues = validateCitations(sheet, [
      { label: "finding", refs: ["F1", "F9"] },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("F9");
  });

  test("rejects material sections with no citations", () => {
    const issues = validateCitations(sheet, [{ label: "finding", refs: [] }]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("cites no facts");
  });

  test("maps refs to deduped evidence ids and throws on unknown refs", () => {
    expect(refsToEvidenceIds(sheet, ["F2", "F1", "F2"])).toEqual([
      "ev-2",
      "ev-1",
    ]);
    expect(() => refsToEvidenceIds(sheet, ["F9"])).toThrow("unknown fact ref");
  });
});
