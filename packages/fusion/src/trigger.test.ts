import { describe, expect, test } from "bun:test";

import {
  evaluateOutcome,
  evaluateTrigger,
  maxWindowDays,
  parseOutcomeSpec,
  parseTriggerSpec,
  PatternSpecError,
  specHash,
  type TriggerSpec,
} from "./trigger";
import { DAY_MS, EPOCH_UTC, type StreamEvent } from "./streams";

function at(days: number): Date {
  return new Date(EPOCH_UTC + days * DAY_MS);
}

function ev(
  id: string,
  category: string,
  days: number,
  kind: "event" | "deviation" = "event",
): StreamEvent {
  return { id, entityId: "ent-1", category, at: at(days), kind };
}

const expansionMove: TriggerSpec = parseTriggerSpec({
  v: 1,
  all: [
    { categories: ["funding"], minCount: 1, windowDays: 90 },
    { categories: ["hiring"], minCount: 3, windowDays: 60 },
    { categories: ["pricing", "packaging"], minCount: 1, windowDays: 60 },
  ],
});

describe("spec parsing", () => {
  test("rejects unknown versions, empty conditions, unknown categories", () => {
    expect(() => parseTriggerSpec({ v: 2, all: [] })).toThrow(PatternSpecError);
    expect(() => parseTriggerSpec({ v: 1, all: [] })).toThrow(PatternSpecError);
    expect(() =>
      parseTriggerSpec({
        v: 1,
        all: [{ categories: ["not_a_category"], windowDays: 30 }],
      }),
    ).toThrow(PatternSpecError);
    expect(() =>
      parseOutcomeSpec({ v: 1, categories: ["launch"], horizonDays: 500 }),
    ).toThrow(PatternSpecError);
  });

  test("defaults: kind=event, minCount=1", () => {
    const spec = parseTriggerSpec({
      v: 1,
      all: [{ categories: ["pricing"], windowDays: 30 }],
    });
    expect(spec.all[0]!.kind).toBe("event");
    expect(spec.all[0]!.minCount).toBe(1);
    expect(maxWindowDays(expansionMove)).toBe(90);
  });
});

describe("evaluateTrigger", () => {
  test("fires only when every condition is satisfied (conjunction)", () => {
    const base = [
      ev("f1", "funding", 10),
      ev("h1", "hiring", 40),
      ev("h2", "hiring", 45),
      ev("h3", "hiring", 50),
    ];
    // Missing the pricing leg.
    expect(evaluateTrigger(expansionMove, base, at(60)).fired).toBe(false);

    const full = [...base, ev("p1", "packaging", 55)];
    const r = evaluateTrigger(expansionMove, full, at(60));
    expect(r.fired).toBe(true);
    expect(r.matchedIds.sort()).toEqual(["f1", "h1", "h2", "h3", "p1"]);
  });

  test("window boundaries: at asOf inclusive, at asOf−windowDays exclusive", () => {
    const spec = parseTriggerSpec({
      v: 1,
      all: [{ categories: ["pricing"], windowDays: 30 }],
    });
    // Exactly at asOf → included.
    expect(evaluateTrigger(spec, [ev("a", "pricing", 60)], at(60)).fired).toBe(true);
    // Exactly at asOf − 30d → excluded (strict >).
    expect(evaluateTrigger(spec, [ev("a", "pricing", 30)], at(60)).fired).toBe(false);
    expect(evaluateTrigger(spec, [ev("a", "pricing", 31)], at(60)).fired).toBe(true);
  });

  test("minCount counts events in-window only", () => {
    const spec = parseTriggerSpec({
      v: 1,
      all: [{ categories: ["hiring"], minCount: 3, windowDays: 60 }],
    });
    const events = [
      ev("h1", "hiring", 5), // outside 60d window at asOf=100
      ev("h2", "hiring", 50),
      ev("h3", "hiring", 60),
      ev("h4", "hiring", 70),
    ];
    expect(evaluateTrigger(spec, events, at(100)).fired).toBe(true);
    expect(evaluateTrigger(spec, events.slice(0, 3), at(100)).fired).toBe(false);
  });

  test("deviation conditions match only deviation-kind events", () => {
    const spec = parseTriggerSpec({
      v: 1,
      all: [{ kind: "deviation", categories: ["launch"], windowDays: 30 }],
    });
    expect(evaluateTrigger(spec, [ev("e1", "launch", 55)], at(60)).fired).toBe(false);
    expect(
      evaluateTrigger(spec, [ev("d1", "launch", 55, "deviation")], at(60)).fired,
    ).toBe(true);
  });
});

describe("evaluateOutcome", () => {
  const outcome = parseOutcomeSpec({
    v: 1,
    categories: ["launch", "market_entry"],
    minCount: 1,
    horizonDays: 120,
  });

  test("first match wins; leadDays measured from firing", () => {
    const r = evaluateOutcome(
      outcome,
      [ev("l2", "launch", 100), ev("l1", "market_entry", 45)],
      at(10),
    );
    expect(r.hit).toBe(true);
    expect(r.matchId).toBe("l1");
    expect(r.leadDays).toBe(35);
  });

  test("horizon boundaries: at firedAt exclusive, at horizon end inclusive", () => {
    expect(evaluateOutcome(outcome, [ev("l1", "launch", 10)], at(10)).hit).toBe(false);
    expect(evaluateOutcome(outcome, [ev("l1", "launch", 130)], at(10)).hit).toBe(true);
    expect(evaluateOutcome(outcome, [ev("l1", "launch", 131)], at(10)).hit).toBe(false);
  });

  test("deviation events never satisfy outcomes", () => {
    expect(
      evaluateOutcome(outcome, [ev("d1", "launch", 40, "deviation")], at(10)).hit,
    ).toBe(false);
  });
});

describe("specHash", () => {
  const outcome = parseOutcomeSpec({
    v: 1,
    categories: ["launch"],
    horizonDays: 120,
  });

  test("stable across key order, distinct across semantics", () => {
    const a = specHash({
      scope: "global",
      entityId: null,
      trigger: expansionMove,
      outcome,
    });
    const b = specHash({
      scope: "global",
      entityId: null,
      trigger: parseTriggerSpec(JSON.parse(JSON.stringify(expansionMove))),
      outcome,
    });
    expect(a).toBe(b);
    expect(a).toHaveLength(32);

    const c = specHash({
      scope: "global",
      entityId: null,
      trigger: expansionMove,
      outcome: { ...outcome, horizonDays: 90 },
    });
    expect(c).not.toBe(a);
  });
});
