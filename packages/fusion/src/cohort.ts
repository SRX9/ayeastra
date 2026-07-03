import { binomialTailP, DEVIATION_P_THRESHOLD, invNormal } from "./baseline";
import { weekEnd, weekIndex, weekStart } from "./streams";

/**
 * Graph-level fusion: cohort co-movement. When several entities that
 * compete in the same market deviate on the same stream in the same week,
 * that is a MARKET-level event ("the whole category is repricing"), not an
 * entity-level one — structural inference over the entity graph, computed
 * from deviations already detected.
 */

export const COHORT_MIN_ENTITIES = 3;

export interface CohortEvent {
  marketEntityId: string;
  category: string;
  weekIdx: number;
  windowStart: Date;
  windowEnd: Date;
  memberEntityIds: string[];
  /** Distinct deviating members. */
  observed: number;
  /** Under independent detectors at the burst false-positive rate. */
  expected: number;
  pValue: number;
  sigmaEquiv: number;
}

export function detectCohortEvents(input: {
  /** Burst/inflection deviations of the target week (any entity). */
  deviations: {
    entityId: string;
    category: string;
    kind: string;
    windowEnd: Date;
  }[];
  /** entity_relations rows; convention: child competes_in parent(market). */
  relations: { parentId: string; childId: string; relation: string }[];
  weekIdx: number;
}): CohortEvent[] {
  const { deviations, relations, weekIdx } = input;

  const membersByMarket = new Map<string, Set<string>>();
  for (const r of relations) {
    if (r.relation !== "competes_in") continue;
    const set = membersByMarket.get(r.parentId) ?? new Set<string>();
    set.add(r.childId);
    membersByMarket.set(r.parentId, set);
  }

  // (market, category) → distinct deviating member entities this week.
  const deviating = new Map<string, Set<string>>();
  for (const d of deviations) {
    if (d.kind !== "burst" && d.kind !== "inflection") continue;
    if (weekIndex(d.windowEnd) !== weekIdx) continue;
    for (const [marketId, members] of membersByMarket) {
      if (!members.has(d.entityId)) continue;
      const key = `${marketId}:${d.category}`;
      const set = deviating.get(key) ?? new Set<string>();
      set.add(d.entityId);
      deviating.set(key, set);
    }
  }

  const out: CohortEvent[] = [];
  for (const [key, entities] of deviating) {
    if (entities.size < COHORT_MIN_ENTITIES) continue;
    const [marketEntityId, category] = key.split(":") as [string, string];
    const memberCount = membersByMarket.get(marketEntityId)!.size;
    // p-value: chance of ≥k INDEPENDENT detections in one week given the
    // detectors' own false-positive ceiling — co-movement is precisely the
    // rejection of that independence.
    const pValue = binomialTailP(entities.size, memberCount, DEVIATION_P_THRESHOLD);
    out.push({
      marketEntityId,
      category,
      weekIdx,
      windowStart: weekStart(weekIdx),
      windowEnd: weekEnd(weekIdx),
      memberEntityIds: [...entities].sort(),
      observed: entities.size,
      expected: memberCount * DEVIATION_P_THRESHOLD,
      pValue,
      sigmaEquiv: invNormal(1 - pValue),
    });
  }
  return out.sort((a, b) =>
    `${a.marketEntityId}:${a.category}`.localeCompare(`${b.marketEntityId}:${b.category}`),
  );
}
