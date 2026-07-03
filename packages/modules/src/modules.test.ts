import { describe, expect, test } from "bun:test";

import {
  activeModuleKeys,
  isModuleActive,
  MODULE_REGISTRY,
  moduleForSignal,
  moduleFromLookupKey,
  moduleLookupKeys,
  sectionDefsForModules,
  TOTAL_THEMED_BUDGET,
} from "./index";

describe("registry", () => {
  test("competitive watch is the retrofitted base module", () => {
    const cw = MODULE_REGISTRY.competitive_watch;
    expect(cw.includedInBase).toBe(true);
    // The Phase-1 briefing sections live in the manifest now.
    expect(cw.briefingSections.map((s) => s.key)).toEqual([
      "pricing_packaging",
      "launches",
      "messaging",
    ]);
  });

  test("category ownership is disjoint and covers every category owner lookup", () => {
    expect(moduleForSignal({ category: "pricing" })).toBe("competitive_watch");
    expect(moduleForSignal({ category: "funding" })).toBe("competitive_watch");
    expect(moduleForSignal({ category: "market_entry" })).toBe(
      "product_market_watch",
    );
    expect(moduleForSignal({ category: "narrative_shift" })).toBe(
      "product_market_watch",
    );
  });

  test("market-role entities always belong to product & market watch", () => {
    expect(moduleForSignal({ category: "funding", entityRole: "market" })).toBe(
      "product_market_watch",
    );
    expect(
      moduleForSignal({ category: "launch", entityRole: "competitor" }),
    ).toBe("competitive_watch");
  });
});

describe("section budgets", () => {
  test("single module keeps its base budgets", () => {
    const defs = sectionDefsForModules(["competitive_watch"]);
    expect(defs.map((d) => [d.key, d.budget])).toEqual([
      ["pricing_packaging", 4],
      ["launches", 5],
      ["messaging", 4],
    ]);
  });

  test("two modules rebalance under the total themed budget", () => {
    const defs = sectionDefsForModules([
      "competitive_watch",
      "product_market_watch",
    ]);
    expect(defs).toHaveLength(5);
    const total = defs.reduce((sum, d) => sum + d.budget, 0);
    expect(total).toBeLessThanOrEqual(TOTAL_THEMED_BUDGET);
    for (const d of defs) expect(d.budget).toBeGreaterThanOrEqual(2);
    // Market sections merged into the one weekly, never a second briefing.
    expect(defs.some((d) => d.key === "market_moves")).toBe(true);
    expect(defs.some((d) => d.key === "category_narrative")).toBe(true);
  });

  test("rebalance never mutates the registry", () => {
    sectionDefsForModules(["competitive_watch", "product_market_watch"]);
    expect(MODULE_REGISTRY.competitive_watch.briefingSections[0]!.budget).toBe(4);
  });
});

describe("entitlements", () => {
  test("base module is active with zero rows", () => {
    expect(activeModuleKeys([])).toEqual(["competitive_watch"]);
  });

  test("live add-on row activates; deactivated row gates cleanly", () => {
    const active = activeModuleKeys([
      { moduleKey: "product_market_watch", deactivatedAt: null },
    ]);
    expect(active).toContain("product_market_watch");

    const after = activeModuleKeys([
      { moduleKey: "product_market_watch", deactivatedAt: new Date() },
    ]);
    expect(after).toEqual(["competitive_watch"]);
    // Deactivating never touches Competitive Watch (2.1 acceptance).
    expect(isModuleActive("competitive_watch", after)).toBe(true);
    expect(isModuleActive("product_market_watch", after)).toBe(false);
  });

  test("billing lookup keys round-trip", () => {
    for (const key of moduleLookupKeys("product_market_watch")) {
      expect(moduleFromLookupKey(key)).toBe("product_market_watch");
    }
    expect(moduleFromLookupKey("team_monthly")).toBeNull();
    expect(moduleFromLookupKey("module_competitive_watch_monthly")).toBeNull();
    expect(moduleFromLookupKey(null)).toBeNull();
  });
});
