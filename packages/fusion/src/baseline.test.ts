import { describe, expect, test } from "bun:test";

import {
  DEVIATION_P_THRESHOLD,
  detectBurst,
  detectInflections,
  deviationDedupKey,
  ewmaRate,
  invNormal,
  poissonTailP,
  weeklyCounts,
} from "./baseline";
import {
  DAY_MS,
  EPOCH_UTC,
  type StreamEvent,
  WEEK_MS,
  weekEnd,
} from "./streams";

/** Event at week w (+ dayOffset days) for one entity/category. */
function ev(w: number, dayOffset = 2, category = "launch"): StreamEvent {
  return {
    id: `e-${w}-${dayOffset}`,
    entityId: "ent-1",
    category,
    at: new Date(EPOCH_UTC + w * WEEK_MS + dayOffset * DAY_MS),
    kind: "event",
  };
}

describe("poissonTailP", () => {
  test("doc example: quarterly rate, 3 events in 28d ≈ p 0.0038", () => {
    // λ = 1/13 per week, μ = 4λ — the fusion doc's canonical acceleration.
    expect(poissonTailP(3, 4 / 13)).toBeCloseTo(0.00386, 4);
  });

  test("k=0 is certainty; known values pin the iterative pmf", () => {
    expect(poissonTailP(0, 5)).toBe(1);
    expect(poissonTailP(1, 1)).toBeCloseTo(1 - Math.exp(-1), 10);
    expect(poissonTailP(4, 1.25)).toBeCloseTo(0.0383, 3);
  });
});

describe("ewmaRate", () => {
  test("seeds with first bucket, folds at α=0.1", () => {
    expect(ewmaRate([])).toBe(0);
    expect(ewmaRate([2])).toBe(2);
    expect(ewmaRate([0, 1])).toBeCloseTo(0.1, 10);
    expect(ewmaRate([1, 0, 0])).toBeCloseTo(0.81, 10);
  });
});

describe("invNormal", () => {
  test("standard quantiles (narration σ-equivalents)", () => {
    expect(invNormal(0.5)).toBeCloseTo(0, 6);
    expect(invNormal(0.975)).toBeCloseTo(1.9600, 3);
    expect(invNormal(1 - DEVIATION_P_THRESHOLD)).toBeCloseTo(2.576, 2);
  });
});

describe("weeklyCounts", () => {
  test("buckets with zeros included, category-filtered, deviations excluded", () => {
    const events = [
      ev(1),
      ev(1, 5),
      ev(3),
      { ...ev(2), kind: "deviation" as const },
      ev(2, 2, "pricing"),
    ];
    expect(weeklyCounts(events, "launch", 1, 4)).toEqual([2, 0, 1, 0]);
  });
});

describe("detectBurst", () => {
  // Quarterly shipper: events every 13 weeks, then 3 releases in 28 days.
  const quarterly = [0, 13, 26, 39, 52, 65, 78].map((w) => ev(w));
  const burst = [ev(89, 1), ev(90, 1), ev(91, 1)];
  const asOf = new Date(EPOCH_UTC + 92 * WEEK_MS);

  test("fires on the doc's canonical acceleration", () => {
    const d = detectBurst({
      entityId: "ent-1",
      events: [...quarterly, ...burst],
      category: "launch",
      asOf,
    });
    expect(d).not.toBeNull();
    expect(d!.kind).toBe("burst");
    expect(d!.observed).toBe(3);
    expect(d!.pValue).toBeLessThan(DEVIATION_P_THRESHOLD);
    expect(d!.pValue).toBeGreaterThan(0.0005);
    expect(d!.stats.historyWeeks).toBe(87);
    expect(d!.sigmaEquiv).toBeGreaterThan(2.6);
    expect(deviationDedupKey(d!)).toBe("ent-1:launch:burst:92");
  });

  test("cold-start gate: under 8 baseline weeks → null", () => {
    const d = detectBurst({
      entityId: "ent-1",
      events: [ev(0), ev(2), ...burst.map((e) => ({ ...e }))],
      category: "launch",
      asOf: new Date(EPOCH_UTC + 12 * WEEK_MS),
    });
    expect(d).toBeNull();
  });

  test("fewer than 3 window events is never a spike", () => {
    const d = detectBurst({
      entityId: "ent-1",
      events: [...quarterly, ev(90, 1), ev(91, 1)],
      category: "launch",
      asOf,
    });
    expect(d).toBeNull();
  });

  test("baseline-consistent activity stays quiet (weekly shipper, 3 in 28d)", () => {
    const weekly = Array.from({ length: 30 }, (_, w) => ev(w));
    const d = detectBurst({
      entityId: "ent-1",
      events: weekly,
      category: "launch",
      asOf: new Date(EPOCH_UTC + 30 * WEEK_MS),
    });
    expect(d).toBeNull();
  });
});

describe("detectInflections", () => {
  // ~0.25/wk baseline: events at weeks 0,4,8,...,28.
  const baseline = [0, 4, 8, 12, 16, 20, 24, 28].map((w) => ev(w, 0));

  test("sustained shift to 1/wk fires once, in the fourth shifted week", () => {
    const shifted = [30, 31, 32, 33, 34, 35].map((w) => ev(w));
    const firings = detectInflections({
      entityId: "ent-1",
      events: [...baseline, ...shifted],
      category: "launch",
      throughWeek: 35,
    });
    expect(firings).toHaveLength(1);
    expect(firings[0]!.kind).toBe("inflection");
    expect(firings[0]!.windowEnd).toEqual(weekEnd(33));
    expect(firings[0]!.observed).toBe(5); // accumulation span opened at week 28
    expect(firings[0]!.expected).toBeCloseTo(1.729, 2);
  });

  test("single-week spike stays quiet (winsorized — the burst detector's job)", () => {
    const spike = [ev(30, 1), ev(30, 2), ev(30, 3), ev(30, 4), ev(30, 5), ev(30, 6)];
    const events = [...baseline, ...spike];
    const firings = detectInflections({
      entityId: "ent-1",
      events,
      category: "launch",
      throughWeek: 35,
    });
    expect(firings).toHaveLength(0);

    // ...and the same spike DOES fire the burst detector: clean separation.
    const d = detectBurst({
      entityId: "ent-1",
      events,
      category: "launch",
      asOf: weekEnd(30),
    });
    expect(d).not.toBeNull();
    // 6 spike events + the week-28 baseline event inside the trailing 28d.
    expect(d!.observed).toBe(7);
  });

  test("sustained shift does NOT fire the burst detector (4 in 28d, p≈0.02)", () => {
    const shifted = [30, 31, 32, 33].map((w) => ev(w));
    const d = detectBurst({
      entityId: "ent-1",
      events: [...baseline, ...shifted],
      category: "launch",
      asOf: weekEnd(33),
    });
    expect(d).toBeNull();
  });

  test("cold start: too little history → no firings", () => {
    const firings = detectInflections({
      entityId: "ent-1",
      events: [ev(0), ev(1), ev(2), ev(3)],
      category: "launch",
      throughWeek: 5,
    });
    expect(firings).toHaveLength(0);
  });

  test("deterministic: identical inputs, identical outputs", () => {
    const shifted = [30, 31, 32, 33, 34, 35].map((w) => ev(w));
    const input = {
      entityId: "ent-1",
      events: [...baseline, ...shifted],
      category: "launch",
      throughWeek: 35,
    };
    expect(detectInflections(input)).toEqual(detectInflections(input));
  });
});
