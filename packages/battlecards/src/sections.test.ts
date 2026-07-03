import { describe, expect, test } from "bun:test";

import { applyEdit, applyRefresh, sectionsForCategory, type Section } from "./sections";

const now = new Date("2026-07-02T12:00:00Z");
const auto = (content: string): Section => ({
  content,
  provenance: "auto",
  updatedAt: "2026-06-01T00:00:00.000Z",
  staleSince: null,
  staleReason: null,
});

describe("battlecard edit safety", () => {
  test("auto sections regenerate and log; unchanged content is a no-op", () => {
    const { sections, changelog } = applyRefresh({
      existing: { pricing_table: auto("| Pro | $499 |"), recent_moves: auto("old moves") },
      regenerated: { pricing_table: "| Pro | $399 |", recent_moves: "old moves" },
      signalId: "sig-1",
      reason: "pricing changed",
      now,
    });
    expect(sections.pricing_table!.content).toBe("| Pro | $399 |");
    expect(changelog).toHaveLength(1); // recent_moves unchanged → no churn
    expect(changelog[0]).toMatchObject({ section: "pricing_table", action: "regenerated", trigger: "sig-1" });
  });

  test("edited sections are NEVER overwritten — flagged stale instead", () => {
    const editedCard = applyEdit({
      existing: { objection_handling: auto("machine text") },
      section: "objection_handling",
      content: "hand-crafted objections",
      userId: "user-1",
      now,
    });
    const { sections, changelog } = applyRefresh({
      existing: editedCard.sections,
      regenerated: { objection_handling: "new machine text" },
      signalId: "sig-2",
      reason: "pricing changed since this was edited",
      now: new Date("2026-07-03T12:00:00Z"),
    });
    expect(sections.objection_handling!.content).toBe("hand-crafted objections");
    expect(sections.objection_handling!.provenance).toBe("edited");
    expect(sections.objection_handling!.staleSince).not.toBeNull();
    expect(changelog[0]!.action).toBe("flagged_stale");
  });

  test("first staleSince is preserved across repeated refreshes", () => {
    const edited = applyEdit({
      existing: {},
      section: "win_themes",
      content: "our themes",
      userId: "u",
      now,
    });
    const first = applyRefresh({
      existing: edited.sections,
      regenerated: { win_themes: "v2" },
      signalId: "s1",
      reason: "r",
      now: new Date("2026-07-03T00:00:00Z"),
    });
    const second = applyRefresh({
      existing: first.sections,
      regenerated: { win_themes: "v3" },
      signalId: "s2",
      reason: "r",
      now: new Date("2026-07-04T00:00:00Z"),
    });
    expect(second.sections.win_themes!.staleSince).toBe(first.sections.win_themes!.staleSince);
  });

  test("a fresh edit clears staleness and flips provenance", () => {
    const { sections } = applyEdit({
      existing: {
        win_themes: { content: "x", provenance: "edited", updatedAt: "2026-06-01T00:00:00.000Z", staleSince: "2026-06-02T00:00:00.000Z", staleReason: "r" },
      },
      section: "win_themes",
      content: "updated by human",
      userId: "u",
      now,
    });
    expect(sections.win_themes!.staleSince).toBeNull();
    expect(sections.win_themes!.provenance).toBe("edited");
  });

  test("category → sections mapping drives refresh relevance", () => {
    expect(sectionsForCategory("pricing")).toContain("pricing_table");
    expect(sectionsForCategory("funding")).toContain("snapshot");
    expect(sectionsForCategory("hiring")).toEqual([]); // not battlecard-relevant
  });
});
