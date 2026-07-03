import {
  binomialTailP,
  coverageFirstWeek,
  ewmaRate,
  LAMBDA_FLOOR,
  weeklyCounts,
} from "./baseline";
import { DAY_MS, EPOCH_UTC, type StreamEvent, WEEK_MS } from "./streams";
import {
  outcomeSpecSchema,
  type OutcomeSpec,
  type TriggerSpec,
  triggerSpecSchema,
} from "./trigger";

/**
 * The self-growing pattern library: mine the archive for ordered
 * category-pair lead-lag structure (A → B within H days) with honest
 * multiple-testing discipline. Hand-seeded patterns cap the moat at analyst
 * imagination; the miner derives outcome specs mechanically and proposes
 * `source:"auto"` CANDIDATES — which must still pass the backtest precision
 * gate like any analyst hypothesis. Double gate: discovery FDR, then
 * validation precision. Nothing mined is ever user-visible directly.
 *
 * Considered and rejected: multivariate Hawkes / transfer entropy — at a
 * few events per quarter per stream the kernels are unidentifiable and fit
 * confident noise. Discrete lead-lag with FDR keeps every number reviewable.
 */

export const MINER_HORIZONS = [30, 60, 90, 120];
export const MINER_FDR_Q = 0.1;
export const MINER_MIN_OPPORTUNITIES = 5;
export const MINER_MIN_HITS = 3;
export const MINER_MIN_LIFT = 2;
export const MAX_MINED_PER_RUN = 10;

export interface LeadLagHypothesis {
  a: string;
  b: string;
  horizonDays: number;
  opportunities: number;
  hits: number;
  /** Opportunity-weighted null hit probability from per-entity EWMA rates. */
  p0: number;
  lift: number;
  pValue: number;
}

export interface MinedCandidate {
  claim: string;
  scope: "global";
  entityId: null;
  trigger: TriggerSpec;
  outcome: OutcomeSpec;
  discovery: { pValue: number; lift: number; q: number };
}

/**
 * Benjamini–Hochberg step-up at level q: sort ascending, find the largest k
 * with p_(k) ≤ (k/m)·q, keep the first k. Deterministic (stable tiebreak).
 */
export function benjaminiHochberg<T extends { pValue: number }>(
  hypotheses: T[],
  q: number,
): T[] {
  const sorted = [...hypotheses].sort((x, y) => x.pValue - y.pValue);
  const m = sorted.length;
  let kStar = 0;
  for (let k = 1; k <= m; k++) {
    if (sorted[k - 1]!.pValue <= (k / m) * q) kStar = k;
  }
  return sorted.slice(0, kStar);
}

export function mineLeadLag(input: {
  eventsByEntity: Map<string, StreamEvent[]>;
  entityIds: string[];
  asOf: Date;
  horizons?: number[];
}): MinedCandidate[] {
  const { eventsByEntity, entityIds, asOf } = input;
  const horizons = input.horizons ?? MINER_HORIZONS;
  const asOfMs = asOf.getTime();
  const lastWeek = Math.floor((asOfMs - EPOCH_UTC) / WEEK_MS) - 1;

  // Per-entity prep: sorted event streams by category + null rates λ_B.
  interface EntityView {
    byCategory: Map<string, number[]>; // sorted event times (ms)
    rate: Map<string, number>; // floored EWMA weekly rate per category
  }
  const views = new Map<string, EntityView>();
  const categories = new Set<string>();
  for (const id of entityIds) {
    const raw = (eventsByEntity.get(id) ?? []).filter((e) => e.kind === "event");
    if (raw.length === 0) continue;
    const byCategory = new Map<string, number[]>();
    for (const e of raw) {
      categories.add(e.category);
      const arr = byCategory.get(e.category) ?? [];
      arr.push(e.at.getTime());
      byCategory.set(e.category, arr);
    }
    for (const arr of byCategory.values()) arr.sort((x, y) => x - y);
    const w0 = coverageFirstWeek(raw);
    const rate = new Map<string, number>();
    if (w0 !== null && lastWeek >= w0) {
      for (const cat of byCategory.keys()) {
        rate.set(
          cat,
          Math.max(ewmaRate(weeklyCounts(raw, cat, w0, lastWeek)), LAMBDA_FLOOR),
        );
      }
    }
    views.set(id, { byCategory, rate });
  }

  // Test every ordered pair × horizon with enough opportunities.
  const hypotheses: LeadLagHypothesis[] = [];
  const cats = [...categories].sort();
  for (const a of cats) {
    for (const b of cats) {
      if (a === b) continue;
      for (const horizonDays of horizons) {
        const hMs = horizonDays * DAY_MS;
        let opportunities = 0;
        let hits = 0;
        let p0Weighted = 0;
        for (const view of views.values()) {
          const aTimes = view.byCategory.get(a);
          const bTimes = view.byCategory.get(b);
          if (!aTimes) continue;
          const lambdaB = view.rate.get(b) ?? LAMBDA_FLOOR;
          const p0 = 1 - Math.exp(-(lambdaB / 7) * horizonDays);
          // Refractory-spaced opportunities: disjoint outcome windows, so a
          // single B event cannot corroborate two A opportunities.
          let nextEligible = -Infinity;
          for (const t of aTimes) {
            if (t < nextEligible) continue;
            if (t + hMs > asOfMs) break; // unresolvable — not an opportunity
            opportunities += 1;
            p0Weighted += p0;
            nextEligible = t + hMs;
            if (bTimes?.some((u) => u > t && u <= t + hMs)) hits += 1;
          }
        }
        if (opportunities < MINER_MIN_OPPORTUNITIES) continue;
        const p0 = p0Weighted / opportunities;
        hypotheses.push({
          a,
          b,
          horizonDays,
          opportunities,
          hits,
          p0,
          lift: p0 > 0 ? hits / opportunities / p0 : 0,
          pValue: binomialTailP(hits, opportunities, p0),
        });
      }
    }
  }

  const survivors = benjaminiHochberg(hypotheses, MINER_FDR_Q)
    .filter((h) => h.hits >= MINER_MIN_HITS && h.lift >= MINER_MIN_LIFT)
    .sort(
      (x, y) =>
        y.lift - x.lift ||
        x.pValue - y.pValue ||
        `${x.a}:${x.b}:${x.horizonDays}`.localeCompare(`${y.a}:${y.b}:${y.horizonDays}`),
    )
    .slice(0, MAX_MINED_PER_RUN);

  return survivors.map((h) => ({
    claim: `${h.a} activity precedes ${h.b} within ~${h.horizonDays} days (mined: ${h.hits}/${h.opportunities} in the archive, ${round1(h.lift)}× base rate).`,
    scope: "global" as const,
    entityId: null,
    trigger: triggerSpecSchema.parse({
      v: 1,
      all: [{ categories: [h.a], minCount: 1, windowDays: 7 }],
    }),
    outcome: outcomeSpecSchema.parse({
      v: 1,
      categories: [h.b],
      minCount: 1,
      horizonDays: h.horizonDays,
    }),
    discovery: { pValue: h.pValue, lift: h.lift, q: MINER_FDR_Q },
  }));
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
