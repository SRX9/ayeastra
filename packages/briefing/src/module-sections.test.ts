import { describe, expect, test } from "bun:test";

import { assembleBriefing } from "./ast";
import { deriveOpenActions } from "./derive";
import { selectForBriefing, type SelectableSignal } from "./select";

const sig = (
  id: string,
  category: string,
  severity: SelectableSignal["severity"] = "high",
  grounding = 80,
): SelectableSignal => ({ id, category, severity, grounding });

describe("module-merged selection (2.1)", () => {
  test("market sections select market categories when PMW is active", () => {
    const { sections } = selectForBriefing(
      [
        sig("a", "market_entry"),
        sig("b", "ma"),
        sig("c", "narrative_shift", "notable"),
        sig("d", "pricing", "critical"),
      ],
      { modules: ["competitive_watch", "product_market_watch"] },
    );
    expect(sections.market_moves).toEqual(expect.arrayContaining(["a", "b"]));
    expect(sections.category_narrative).toEqual(["c"]);
    expect(sections.pricing_packaging).toEqual(["d"]);
  });

  test("without PMW, market signals never claim a themed section", () => {
    const { sections } = selectForBriefing([
      sig("a", "market_entry"),
      sig("b", "pricing"),
    ]);
    expect(sections.market_moves).toBeUndefined();
    // …but a high-severity market signal still isn't silently invented into
    // sections — it falls to top_moves only if it exists at all upstream
    // (routing gates it before selection for inactive modules).
    expect(sections.top_moves).toContain("a");
  });

  test("budget pressure removes one slot from the pressured section only", () => {
    const pricing = Array.from({ length: 6 }, (_, i) => sig(`p${i}`, "pricing"));
    const launches = Array.from({ length: 6 }, (_, i) => sig(`l${i}`, "launch"));
    const base = selectForBriefing([...pricing, ...launches]);
    const pressured = selectForBriefing([...pricing, ...launches], {
      pressuredCategories: new Set(["pricing"]),
    });
    expect(pressured.sections.pricing_packaging!.length).toBe(
      base.sections.pricing_packaging!.length - 1,
    );
    expect(pressured.sections.launches!.length).toBe(
      base.sections.launches!.length,
    );
  });
});

describe("module sections in the AST", () => {
  test("module sections carry module_key; platform sections do not", () => {
    const block = { heading: null, text: "x", refs: [], ownerRole: null };
    const ast = assembleBriefing({
      kind: "weekly",
      periodLabel: "W1",
      orgName: "Acme",
      quietWeek: false,
      webUrl: "https://app/briefings/1",
      citations: {},
      sections: {
        market_moves: [block],
        pricing_packaging: [block],
        exec_summary: [block],
      },
    });
    const byKey = new Map(ast.sections.map((s) => [s.key, s]));
    expect(byKey.get("market_moves")!.moduleKey).toBe("product_market_watch");
    expect(byKey.get("market_moves")!.title).toBe("Market moves");
    expect(byKey.get("pricing_packaging")!.moduleKey).toBe("competitive_watch");
    expect(byKey.get("exec_summary")!.moduleKey).toBeUndefined();
    // Reading order: exec summary first, module sections before derived.
    expect(ast.sections[0]!.key).toBe("exec_summary");
  });
});

describe("open actions line (2.2)", () => {
  test("compact single block, oldest first, capped at three", () => {
    const blocks = deriveOpenActions([
      { description: "Update battlecard", ownerName: "Sam", ageDays: 3 },
      { description: "Review pricing", ownerName: null, ageDays: 10 },
      { description: "Brief sales", ownerName: "Ana", ageDays: 7 },
      { description: "Ship FAQ", ownerName: null, ageDays: 1 },
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.text).toStartWith("4 open actions.");
    expect(blocks[0]!.text).toContain("Review pricing — open 10d");
    expect(blocks[0]!.text).not.toContain("Ship FAQ");
  });

  test("no open actions → no section (honest omission)", () => {
    expect(deriveOpenActions([])).toEqual([]);
  });
});
