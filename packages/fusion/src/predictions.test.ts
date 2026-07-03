import { describe, expect, test } from "bun:test";

import { firableValidated, type PatternRow } from "./lifecycle";
import {
  foldLiveResolution,
  makePrediction,
  patternCorroboration,
  resolvePrediction,
} from "./predictions";
import { DAY_MS, EPOCH_UTC, type StreamEvent } from "./streams";

const outcomeSpec = { v: 1, categories: ["launch"], minCount: 1, horizonDays: 90 };

function pattern(status: PatternRow["status"]): PatternRow {
  return {
    id: "pat-1",
    scope: "global",
    entityId: null,
    claim: "c",
    triggerSpec: { v: 1, all: [{ categories: ["pricing"], windowDays: 30 }] },
    outcomeSpec,
    status,
    source: "analyst",
    validation: null,
  };
}

function at(days: number): Date {
  return new Date(EPOCH_UTC + days * DAY_MS);
}

function ev(id: string, category: string, days: number): StreamEvent {
  return { id, entityId: "e1", category, at: at(days), kind: "event" };
}

describe("makePrediction", () => {
  test("day-buckets firedAt and derives resolvesBy from the outcome horizon", () => {
    const [validated] = firableValidated([pattern("validated")]);
    const draft = makePrediction(validated!, "e1", new Date(at(10).getTime() + 7 * 3600 * 1000));
    expect(draft.firedAt).toEqual(at(10));
    expect(draft.resolvesBy).toEqual(at(100));
    expect(draft.patternId).toBe("pat-1");
  });

  test("runtime backstop: a candidate smuggled past the types still throws", () => {
    // Deliberate cast — simulating a caller that defeats the brand.
    const smuggled = pattern("candidate") as Parameters<typeof makePrediction>[0];
    expect(() => makePrediction(smuggled, "e1", at(10))).toThrow(
      /forward-looking claims require 'validated'/,
    );
  });
});

describe("resolvePrediction", () => {
  const prediction = { firedAt: at(10), resolvesBy: at(100) };

  test("hit as soon as the outcome appears — even before the horizon ends", () => {
    const r = resolvePrediction(prediction, outcomeSpec, [ev("l1", "launch", 45)], at(50));
    expect(r).toEqual({ outcome: "hit", matchId: "l1", leadDays: 35 });
  });

  test("miss only after the horizon fully expires", () => {
    expect(resolvePrediction(prediction, outcomeSpec, [], at(50)).outcome).toBe("pending");
    expect(resolvePrediction(prediction, outcomeSpec, [], at(100)).outcome).toBe("miss");
  });

  test("outcomes outside the horizon never count", () => {
    const r = resolvePrediction(prediction, outcomeSpec, [ev("l1", "launch", 150)], at(160));
    expect(r.outcome).toBe("miss");
  });
});

describe("foldLiveResolution", () => {
  test("accumulates the live record without touching backtest data", () => {
    const v1 = foldLiveResolution(null, "hit");
    expect(v1.live).toEqual({ n: 1, hits: 1, misses: 0 });
    const v2 = foldLiveResolution(v1, "miss");
    expect(v2.live).toEqual({ n: 2, hits: 1, misses: 1 });
  });
});

describe("patternCorroboration", () => {
  const actions = [
    { id: "a1", sourceType: "insight", sourceId: "i1" },
    { id: "a2", sourceType: "insight", sourceId: "i2" },
    { id: "a3", sourceType: "signal", sourceId: "i1" }, // wrong source type
  ];

  test("counts org actions on this pattern's insights and logged outcomes", () => {
    expect(
      patternCorroboration({
        insightIds: ["i1", "i2"],
        actions,
        outcomes: [{ actionId: "a1" }],
      }),
    ).toBe("Your team acted on this pattern 2 times; 1 outcome logged.");
    expect(
      patternCorroboration({
        insightIds: ["i1"],
        actions,
        outcomes: [],
      }),
    ).toBe("Your team acted on this pattern once; 0 outcomes logged.");
  });

  test("no actions → no corroboration line at all", () => {
    expect(
      patternCorroboration({ insightIds: ["iX"], actions, outcomes: [] }),
    ).toBeNull();
  });
});
