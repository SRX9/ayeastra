import { describe, expect, test } from "bun:test";

import type { BacktestResult } from "./backtest";
import {
  applyBacktest,
  assertValidated,
  firableValidated,
  industryEntityIds,
  passesGate,
  type PatternRow,
  patternEntityUniverse,
  renderTrackRecord,
  SEED_PATTERNS,
  shouldRetire,
  VALIDATION_HISTORY_MAX,
} from "./lifecycle";

function result(partial: Partial<BacktestResult>): BacktestResult {
  return {
    n: 5,
    hits: 4,
    misses: 1,
    unresolved: 0,
    precision: 0.8,
    wilsonLcb: 0.5135,
    leadTimeDays: { p25: 41, p50: 55, p75: 68, n: 4 },
    episodes: [],
    ...partial,
  };
}

function pattern(partial: Partial<PatternRow>): PatternRow {
  return {
    id: "pat-1",
    scope: "global",
    entityId: null,
    claim: "test",
    triggerSpec: {},
    outcomeSpec: {},
    status: "candidate",
    source: "analyst",
    validation: null,
    ...partial,
  };
}

const window = {
  archiveStart: new Date("2025-01-01T00:00:00Z"),
  archiveEnd: new Date("2026-06-01T00:00:00Z"),
};
const now = new Date("2026-06-02T00:00:00Z");

describe("passesGate", () => {
  test("requires n ≥ 5 AND precision ≥ 0.7 AND wilson LCB ≥ 0.5", () => {
    expect(passesGate({ n: 5, precision: 0.8, wilsonLcb: 0.5135 })).toBe(true);
    expect(passesGate({ n: 4, precision: 1, wilsonLcb: 0.62 })).toBe(false);
    expect(passesGate({ n: 5, precision: 0.6, wilsonLcb: 0.51 })).toBe(false);
    expect(passesGate({ n: 5, precision: 0.8, wilsonLcb: 0.49 })).toBe(false);
    expect(passesGate({ n: 0, precision: null, wilsonLcb: null })).toBe(false);
  });
});

describe("applyBacktest", () => {
  test("candidate → validated through the gate; failing stays candidate", () => {
    const up = applyBacktest(pattern({}), result({}), window, now);
    expect(up.status).toBe("validated");
    expect(up.validation.backtest!.precision).toBe(0.8);
    expect(up.validation.history).toHaveLength(1);

    const down = applyBacktest(
      pattern({}),
      result({ hits: 3, misses: 2, precision: 0.6, wilsonLcb: 0.3304 }),
      window,
      now,
    );
    expect(down.status).toBe("candidate");
  });

  test("validated → candidate on decay (honest demotion, history kept)", () => {
    const demoted = applyBacktest(
      pattern({ status: "validated" }),
      result({ hits: 3, misses: 2, precision: 0.6, wilsonLcb: 0.3304 }),
      window,
      now,
    );
    expect(demoted.status).toBe("candidate");
    expect(demoted.validation.history).toHaveLength(1);
  });

  test("retired is terminal — even a passing backtest cannot revive it", () => {
    const r = applyBacktest(pattern({ status: "retired" }), result({}), window, now);
    expect(r.status).toBe("retired");
  });

  test("history is capped", () => {
    let p = pattern({});
    for (let i = 0; i < VALIDATION_HISTORY_MAX + 2; i++) {
      const up = applyBacktest(p, result({}), window, now);
      p = pattern({ status: up.status, validation: up.validation });
    }
    const v = p.validation as { history: unknown[] };
    expect(v.history).toHaveLength(VALIDATION_HISTORY_MAX);
  });
});

describe("the mechanical gate (acceptance #2)", () => {
  test("firableValidated filters candidates and retired patterns out", () => {
    const rows = [
      pattern({ id: "c", status: "candidate" }),
      pattern({ id: "v", status: "validated" }),
      pattern({ id: "r", status: "retired" }),
    ];
    const firable = firableValidated(rows);
    expect(firable.map((p) => p.id)).toEqual(["v"]);
  });

  test("assertValidated throws on anything but validated", () => {
    expect(() => assertValidated(pattern({ status: "candidate" }))).toThrow(
      /forward-looking claims require 'validated'/,
    );
    expect(() => assertValidated(pattern({ status: "retired" }))).toThrow();
    expect(() => assertValidated(pattern({ status: "validated" }))).not.toThrow();
  });
});

describe("shouldRetire", () => {
  const bt = {
    n: 5,
    hits: 4,
    misses: 1,
    unresolved: 0,
    precision: 0.8,
    wilsonLcb: 0.5135,
    leadTimeDays: null,
    archiveStart: "",
    archiveEnd: "",
    ranAt: "",
  };

  test("live decay retires; healthy live record does not", () => {
    // 4/5 backtest + 0/3 live → combined 4/8, LCB ≈ 0.293 < 0.35 → retire.
    expect(shouldRetire({ backtest: bt, live: { n: 3, hits: 0, misses: 3 } })).toBe(true);
    // 4/5 + 2/3 → combined 6/8, LCB ≈ 0.524 → keep.
    expect(shouldRetire({ backtest: bt, live: { n: 3, hits: 2, misses: 1 } })).toBe(false);
  });

  test("needs ≥ 3 live resolutions before it can retire anything", () => {
    expect(shouldRetire({ backtest: bt, live: { n: 2, hits: 0, misses: 2 } })).toBe(false);
    expect(shouldRetire({ backtest: bt })).toBe(false);
  });
});

describe("renderTrackRecord", () => {
  test("numbers come from validation, deterministically", () => {
    expect(
      renderTrackRecord({
        backtest: {
          n: 5,
          hits: 4,
          misses: 1,
          unresolved: 0,
          precision: 0.8,
          wilsonLcb: 0.5135,
          leadTimeDays: { p25: 41, p50: 55, p75: 68, n: 4 },
          archiveStart: "",
          archiveEnd: "",
          ranAt: "",
        },
        live: { n: 2, hits: 2, misses: 0 },
      }),
    ).toBe(
      "Preceded 4 of 5 observed outcomes in the archive, typically 41–68 days ahead; 2 of 2 live predictions resolved as hits.",
    );
    expect(renderTrackRecord({})).toBe("No resolved backtest episodes yet.");
  });
});

describe("scope resolution", () => {
  const relations = [
    { parentId: "mkt-1", childId: "co-1", relation: "competes_in" },
    { parentId: "mkt-1", childId: "co-2", relation: "competes_in" },
    { parentId: "mkt-2", childId: "co-3", relation: "competes_in" },
    { parentId: "co-1", childId: "prod-1", relation: "product_of" },
  ];

  test("industry scope = competes_in members of the market entity", () => {
    expect(industryEntityIds("mkt-1", relations)).toEqual(["co-1", "co-2"]);
  });

  test("patternEntityUniverse per scope", () => {
    const world = { allEntityIds: ["co-1", "co-2", "co-3"], relations };
    expect(
      patternEntityUniverse({ scope: "entity", entityId: "co-3" }, world),
    ).toEqual(["co-3"]);
    expect(
      patternEntityUniverse({ scope: "industry", entityId: "mkt-1" }, world),
    ).toEqual(["co-1", "co-2"]);
    expect(patternEntityUniverse({ scope: "global", entityId: null }, world)).toEqual(
      world.allEntityIds,
    );
  });
});

describe("SEED_PATTERNS", () => {
  test("all seeds parse and enter as analyst candidates", () => {
    expect(SEED_PATTERNS.length).toBeGreaterThanOrEqual(4);
    for (const s of SEED_PATTERNS) {
      expect(s.trigger.v).toBe(1);
      expect(s.outcome.horizonDays).toBeGreaterThanOrEqual(7);
      expect(s.claim.length).toBeGreaterThan(10);
    }
  });
});
