import { describe, expect, test } from "bun:test";

import { detectCohortEvents } from "./cohort";
import { benjaminiHochberg, mineLeadLag } from "./miner";
import { DAY_MS, EPOCH_UTC, type StreamEvent, weekEnd } from "./streams";

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

describe("benjaminiHochberg", () => {
  test("step-up: largest k with p_(k) ≤ (k/m)·q wins", () => {
    const h = (p: number) => ({ pValue: p });
    expect(benjaminiHochberg([h(0.01), h(0.02), h(0.03), h(0.5), h(0.6)], 0.1).length).toBe(3);
    // Step-up rescue: a later k can qualify earlier ones.
    expect(benjaminiHochberg([h(0.04), h(0.045), h(0.046)], 0.15).length).toBe(3);
    expect(benjaminiHochberg([h(0.5), h(0.6)], 0.1)).toEqual([]);
    expect(benjaminiHochberg([], 0.1)).toEqual([]);
  });
});

describe("mineLeadLag", () => {
  test("discovers a planted pricing→launch lead-lag with derived outcome", () => {
    // 6 entities; launches always land 30 days after pricing moves.
    const eventsByEntity = new Map<string, StreamEvent[]>();
    for (let i = 1; i <= 6; i++) {
      const id = `P${i}`;
      eventsByEntity.set(id, [
        ev(id, "other", 0),
        ev(id, "pricing", 100),
        ev(id, "launch", 130),
        ev(id, "pricing", 300),
        ev(id, "launch", 330),
        ev(id, "pricing", 500),
        ev(id, "launch", 530),
      ]);
    }
    const candidates = mineLeadLag({
      eventsByEntity,
      entityIds: [...eventsByEntity.keys()],
      asOf: at(700),
    });

    expect(candidates.length).toBeGreaterThan(0);
    // Every survivor is the planted pair — no noise discoveries.
    for (const c of candidates) {
      expect(c.trigger.all[0]!.categories).toEqual(["pricing"]);
      expect(c.outcome.categories).toEqual(["launch"]);
      expect(c.discovery.lift).toBeGreaterThanOrEqual(2);
      expect(c.discovery.pValue).toBeLessThan(0.01);
    }
    // Tightest horizon has the highest lift and ranks first.
    expect(candidates[0]!.outcome.horizonDays).toBe(30);
    expect(candidates[0]!.claim).toContain("pricing");
  });

  test("pure noise yields zero survivors at q=0.1 (FDR holds)", () => {
    // Deterministic LCG noise: sparse independent events, 3 categories.
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const eventsByEntity = new Map<string, StreamEvent[]>();
    for (let i = 1; i <= 8; i++) {
      const id = `N${i}`;
      const events: StreamEvent[] = [ev(id, "other", 0)];
      for (const cat of ["pricing", "launch", "hiring"]) {
        for (let k = 0; k < 4; k++) {
          events.push(ev(id, cat, Math.floor(rand() * 680)));
        }
      }
      eventsByEntity.set(id, events);
    }
    const candidates = mineLeadLag({
      eventsByEntity,
      entityIds: [...eventsByEntity.keys()],
      asOf: at(700),
    });
    expect(candidates).toEqual([]);
  });

  test("deterministic: identical archive, identical candidates", () => {
    const eventsByEntity = new Map<string, StreamEvent[]>();
    for (let i = 1; i <= 6; i++) {
      const id = `P${i}`;
      eventsByEntity.set(id, [
        ev(id, "other", 0),
        ev(id, "pricing", 100),
        ev(id, "launch", 130),
        ev(id, "pricing", 300),
        ev(id, "launch", 330),
        ev(id, "pricing", 500),
        ev(id, "launch", 530),
      ]);
    }
    const input = {
      eventsByEntity,
      entityIds: [...eventsByEntity.keys()],
      asOf: at(700),
    };
    expect(mineLeadLag(input)).toEqual(mineLeadLag(input));
  });
});

describe("detectCohortEvents", () => {
  const relations = [
    { parentId: "mkt", childId: "a", relation: "competes_in" },
    { parentId: "mkt", childId: "b", relation: "competes_in" },
    { parentId: "mkt", childId: "c", relation: "competes_in" },
    { parentId: "mkt", childId: "d", relation: "competes_in" },
    { parentId: "mkt2", childId: "z", relation: "competes_in" },
  ];
  // windowEnd = weekEnd(100) lies ON the week-101 boundary — a deviation's
  // week key is the week it SURFACED (weekIndex(windowEnd) = 101).
  const dev = (entityId: string, category = "pricing", kind = "burst") => ({
    entityId,
    category,
    kind,
    windowEnd: weekEnd(100),
  });

  test("3+ same-market same-category deviations → one market event", () => {
    const events = detectCohortEvents({
      deviations: [dev("a"), dev("b"), dev("c", "pricing", "inflection"), dev("z")],
      relations,
      weekIdx: 101,
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.marketEntityId).toBe("mkt");
    expect(events[0]!.category).toBe("pricing");
    expect(events[0]!.observed).toBe(3);
    expect(events[0]!.memberEntityIds).toEqual(["a", "b", "c"]);
    expect(events[0]!.pValue).toBeLessThan(1e-5);
  });

  test("two deviating members is coincidence, not a cohort", () => {
    expect(
      detectCohortEvents({
        deviations: [dev("a"), dev("b")],
        relations,
        weekIdx: 101,
      }),
    ).toEqual([]);
  });

  test("different categories and other weeks never pool", () => {
    expect(
      detectCohortEvents({
        deviations: [
          dev("a", "pricing"),
          dev("b", "hiring"),
          dev("c", "launch"),
          { ...dev("d"), windowEnd: weekEnd(99) },
        ],
        relations,
        weekIdx: 101,
      }),
    ).toEqual([]);
  });

  test("cohort deviations themselves never pool (no recursion)", () => {
    expect(
      detectCohortEvents({
        deviations: [
          { ...dev("a"), kind: "cohort" },
          { ...dev("b"), kind: "cohort" },
          { ...dev("c"), kind: "cohort" },
        ],
        relations,
        weekIdx: 101,
      }),
    ).toEqual([]);
  });
});
