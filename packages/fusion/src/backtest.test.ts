import { describe, expect, test } from "bun:test";

import {
  backtestPattern,
  leadTimeQuantiles,
  sweepDeviationEvents,
  wilsonLower,
} from "./backtest";
import { DAY_MS, EPOCH_UTC, type StreamEvent, WEEK_MS } from "./streams";
import { parseOutcomeSpec, parseTriggerSpec } from "./trigger";

function at(days: number): Date {
  return new Date(EPOCH_UTC + days * DAY_MS);
}

function ev(entityId: string, category: string, days: number): StreamEvent {
  return {
    id: `${entityId}:${category}:${days}`,
    entityId,
    category,
    at: at(days),
    kind: "event",
  };
}

const expansionTrigger = parseTriggerSpec({
  v: 1,
  all: [
    { categories: ["funding"], minCount: 1, windowDays: 90 },
    { categories: ["hiring"], minCount: 3, windowDays: 60 },
    { categories: ["pricing", "packaging"], minCount: 1, windowDays: 60 },
  ],
});
const expansionOutcome = parseOutcomeSpec({
  v: 1,
  categories: ["launch", "market_entry"],
  minCount: 1,
  horizonDays: 120,
});

/** The expansion-move sequence: funding d70, hiring ×3, pricing d91. */
function sequence(entity: string, extra: StreamEvent[]): StreamEvent[] {
  return [
    ev(entity, "other", 0), // coverage anchor — history precedes the sequence
    ev(entity, "funding", 70),
    ev(entity, "hiring", 77),
    ev(entity, "hiring", 80),
    ev(entity, "hiring", 84),
    ev(entity, "pricing", 91),
    ...extra,
  ];
}

describe("wilsonLower", () => {
  test("gate arithmetic: 4/5 passes 0.5, 3/5 fails, one-sided 90%", () => {
    expect(wilsonLower(4, 5, 1.2816)).toBeCloseTo(0.5135, 3);
    expect(wilsonLower(3, 5, 1.2816)).toBeCloseTo(0.3304, 3);
    expect(wilsonLower(0, 0, 1.2816)).toBe(0);
  });
});

describe("leadTimeQuantiles", () => {
  test("linear interpolation, rounded to days", () => {
    expect(leadTimeQuantiles([])).toBeNull();
    expect(leadTimeQuantiles([35, 39, 55, 59])).toEqual({
      p25: 38,
      p50: 47,
      p75: 56,
      n: 4,
    });
  });
});

describe("backtestPattern — the documented expansion-move archive", () => {
  // 4 hits, 1 miss, 1 unresolved — the doc's flagship "4 of 5" pattern.
  const eventsByEntity = new Map<string, StreamEvent[]>([
    ["A", sequence("A", [ev("A", "launch", 126)])], // hit, lead 35
    ["B", sequence("B", [])], // miss — no launch followed
    ["C", sequence("C", [ev("C", "launch", 130)])], // hit, lead 39
    ["E", sequence("E", [ev("E", "market_entry", 150)])], // hit, lead 59
    [
      "F", // same shape shifted +14d → fires d105, launch d160, lead 55
      [
        ev("F", "other", 0),
        ev("F", "funding", 84),
        ev("F", "hiring", 91),
        ev("F", "hiring", 94),
        ev("F", "hiring", 98),
        ev("F", "pricing", 105),
        ev("F", "launch", 160),
      ],
    ],
    [
      "D", // fires d312; horizon d432 > archiveEnd d365 → unresolved
      [
        ev("D", "other", 200),
        ev("D", "funding", 300),
        ev("D", "hiring", 305),
        ev("D", "hiring", 307),
        ev("D", "hiring", 310),
        ev("D", "pricing", 312),
      ],
    ],
  ]);
  const input = {
    trigger: expansionTrigger,
    outcome: expansionOutcome,
    eventsByEntity,
    entityIds: ["A", "B", "C", "D", "E", "F"],
    archiveEnd: at(365),
  };

  test("reproduces the documented sequences exactly", () => {
    const r = backtestPattern(input);
    expect(r.episodes).toHaveLength(6);

    const byEntity = new Map(r.episodes.map((e) => [e.entityId, e]));
    expect(byEntity.get("A")!.outcome).toBe("hit");
    expect(byEntity.get("A")!.firedAt).toEqual(at(91)); // the day pricing lands
    expect(byEntity.get("A")!.leadDays).toBe(35);
    expect(byEntity.get("A")!.matchId).toBe("A:launch:126");
    expect(byEntity.get("B")!.outcome).toBe("miss");
    expect(byEntity.get("D")!.outcome).toBe("unresolved");
    expect(byEntity.get("F")!.firedAt).toEqual(at(105));

    expect(r.n).toBe(5); // unresolved excluded
    expect(r.hits).toBe(4);
    expect(r.misses).toBe(1);
    expect(r.unresolved).toBe(1);
    expect(r.precision).toBeCloseTo(0.8, 10);
    expect(r.wilsonLcb).toBeCloseTo(0.5135, 3);
    expect(r.leadTimeDays).toEqual({ p25: 38, p50: 47, p75: 56, n: 4 });
  });

  test("deterministic: two runs are deep-equal", () => {
    expect(backtestPattern(input)).toEqual(backtestPattern(input));
  });

  test("no-lookahead canary: an outcome BEFORE the firing is not a hit", () => {
    const r = backtestPattern({
      ...input,
      eventsByEntity: new Map([["A", sequence("A", [ev("A", "launch", 90)])]]),
      entityIds: ["A"],
    });
    expect(r.episodes).toHaveLength(1);
    expect(r.episodes[0]!.outcome).toBe("miss");
  });

  test("refractory: a trigger that stays hot yields one episode per horizon", () => {
    // Dense stream keeps every condition satisfied for weeks — still 1 episode.
    const hot = [
      ev("H", "other", 0),
      ev("H", "funding", 70),
      ...[77, 80, 84, 88, 92, 96, 100].map((d) => ev("H", "hiring", d)),
      ...[91, 95, 99, 103].map((d) => ev("H", "pricing", d)),
      ev("H", "launch", 130),
    ];
    const r = backtestPattern({
      ...input,
      eventsByEntity: new Map([["H", hot]]),
      entityIds: ["H"],
    });
    expect(r.episodes).toHaveLength(1);
    expect(r.hits).toBe(1);
  });

  test("two well-separated sequences → two episodes", () => {
    const twice = [
      ...sequence("T", [ev("T", "launch", 126)]),
      ev("T", "funding", 400),
      ev("T", "hiring", 405),
      ev("T", "hiring", 407),
      ev("T", "hiring", 410),
      ev("T", "pricing", 412),
      ev("T", "launch", 470),
    ];
    const r = backtestPattern({
      ...input,
      eventsByEntity: new Map([["T", twice]]),
      entityIds: ["T"],
      archiveEnd: at(600),
    });
    expect(r.episodes).toHaveLength(2);
    expect(r.hits).toBe(2);
    expect(r.episodes[1]!.firedAt).toEqual(at(412));
  });

  test("coverage gating: an entity without window-depth never fires", () => {
    // Sequence starts at the entity's very first event — the longest window
    // (90d) has no coverage yet, so the grid starts after events roll out.
    const shallow = [
      ev("S", "funding", 0),
      ev("S", "hiring", 7),
      ev("S", "hiring", 8),
      ev("S", "hiring", 9),
      ev("S", "pricing", 10),
    ];
    const r = backtestPattern({
      ...input,
      eventsByEntity: new Map([["S", shallow]]),
      entityIds: ["S"],
    });
    expect(r.episodes).toHaveLength(0);
  });
});

describe("backtestPattern — deviation-conditioned patterns", () => {
  const trigger = parseTriggerSpec({
    v: 1,
    all: [{ kind: "deviation", categories: ["launch"], minCount: 1, windowDays: 30 }],
  });
  const outcome = parseOutcomeSpec({
    v: 1,
    categories: ["pricing"],
    minCount: 1,
    horizonDays: 90,
  });

  test("cadence acceleration → pricing move backtests as a hit", () => {
    // Quarterly launcher (weeks 0..78), then 3 launches inside 28 days,
    // then a pricing move — the deviation itself is recomputed in-sweep.
    const events = [
      ...[0, 13, 26, 39, 52, 65, 78].map((w) =>
        ev("Q", "launch", w * 7 + 2),
      ),
      ev("Q", "launch", 89 * 7 + 1), // d624
      ev("Q", "launch", 90 * 7 + 1), // d631
      ev("Q", "launch", 91 * 7 + 1), // d638
      ev("Q", "pricing", 660),
    ];
    const r = backtestPattern({
      trigger,
      outcome,
      eventsByEntity: new Map([["Q", events]]),
      entityIds: ["Q"],
      archiveEnd: at(740),
    });
    expect(r.episodes).toHaveLength(1);
    expect(r.episodes[0]!.firedAt).toEqual(at(638)); // day the 3rd launch lands
    expect(r.hits).toBe(1);
    expect(r.episodes[0]!.leadDays).toBe(22);
  });

  test("sweepDeviationEvents dedups bursts to one per week", () => {
    const events = [
      ...[0, 13, 26, 39, 52, 65, 78].map((w) => ev("Q", "launch", w * 7 + 2)),
      ev("Q", "launch", 89 * 7 + 1),
      ev("Q", "launch", 90 * 7 + 1),
      ev("Q", "launch", 91 * 7 + 1),
    ];
    const devs = sweepDeviationEvents({
      entityId: "Q",
      events,
      categories: ["launch"],
      fromMs: EPOCH_UTC,
      toMs: EPOCH_UTC + 100 * WEEK_MS,
    });
    const weeks = devs.filter((d) => d.category === "launch").map((d) => d.id);
    expect(new Set(weeks).size).toBe(weeks.length); // no duplicate week keys
    expect(devs.length).toBeGreaterThan(0);
  });
});
