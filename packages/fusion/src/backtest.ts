import {
  detectBurst,
  detectInflections,
  type Deviation,
} from "./baseline";
import {
  DAY_MS,
  EPOCH_UTC,
  type StreamEvent,
  WEEK_MS,
  weekIndex,
} from "./streams";
import {
  evaluateOutcome,
  evaluateTrigger,
  maxWindowDays,
  type OutcomeSpec,
  type TriggerSpec,
} from "./trigger";

/**
 * The backtest harness — replay is the SAME evaluator swept across the
 * archive on a daily UTC grid. No-lookahead is structural: the evaluator's
 * windows only ever reach backward from asOf. Precision measured here is
 * therefore the precision of the exact machinery that fires live.
 */

export interface BacktestEpisode {
  entityId: string;
  firedAt: Date;
  outcome: "hit" | "miss" | "unresolved";
  matchId: string | null;
  leadDays: number | null;
}

export interface LeadTimeQuantiles {
  p25: number;
  p50: number;
  p75: number;
  n: number;
}

export interface BacktestResult {
  n: number;
  hits: number;
  misses: number;
  unresolved: number;
  precision: number | null;
  wilsonLcb: number | null;
  leadTimeDays: LeadTimeQuantiles | null;
  episodes: BacktestEpisode[];
}

/**
 * Wilson score interval lower bound. The gate uses the one-sided 90% bound
 * (z = 1.2816): 4/5 hits → 0.514 (passes ≥ 0.5), 3/5 → 0.330 (fails) —
 * small-n luck cannot clear it.
 */
export function wilsonLower(hits: number, n: number, z: number): number {
  if (n === 0) return 0;
  const p = hits / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = p + z2 / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return (center - spread) / denom;
}

/** Empirical firing→outcome lead-time quantiles (linear interpolation). */
export function leadTimeQuantiles(days: number[]): LeadTimeQuantiles | null {
  if (days.length === 0) return null;
  const s = [...days].sort((a, b) => a - b);
  const q = (p: number) => {
    const idx = (s.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return s[lo]! + (s[hi]! - s[lo]!) * (idx - lo);
  };
  return {
    p25: Math.round(q(0.25)),
    p50: Math.round(q(0.5)),
    p75: Math.round(q(0.75)),
    n: s.length,
  };
}

/**
 * Deviation StreamEvents for one entity's archive, recomputed with the same
 * detectors the live job runs (live detection ≡ backtest replay). Bursts are
 * evaluated on the daily grid and deduped to one event per (category, week)
 * — first firing wins, mirroring the DB dedupKey. Inflections come from the
 * weekly CUSUM fold, one event per crossing.
 */
export function sweepDeviationEvents(input: {
  entityId: string;
  events: StreamEvent[];
  categories: Iterable<string>;
  fromMs: number;
  toMs: number;
}): StreamEvent[] {
  const { entityId, events, categories, fromMs, toMs } = input;
  const out: StreamEvent[] = [];
  const push = (d: Deviation) => {
    out.push({
      id: `dev:${entityId}:${d.category}:${d.kind}:${weekIndex(d.windowEnd)}`,
      entityId,
      category: d.category,
      at: d.windowEnd,
      kind: "deviation",
    });
  };
  for (const category of categories) {
    const seenWeeks = new Set<number>();
    for (let t = fromMs; t <= toMs; t += DAY_MS) {
      const d = detectBurst({ entityId, events, category, asOf: new Date(t) });
      if (!d) continue;
      const w = weekIndex(d.windowEnd);
      if (seenWeeks.has(w)) continue;
      seenWeeks.add(w);
      push(d);
    }
    const throughWeek = Math.floor((toMs - EPOCH_UTC) / WEEK_MS) - 1;
    for (const d of detectInflections({ entityId, events, category, throughWeek })) {
      if (d.windowEnd.getTime() >= fromMs && d.windowEnd.getTime() <= toMs) push(d);
    }
  }
  return out;
}

/** UTC-midnight day grid aligned to EPOCH_UTC. */
function ceilDay(ms: number): number {
  return EPOCH_UTC + Math.ceil((ms - EPOCH_UTC) / DAY_MS) * DAY_MS;
}

export function backtestPattern(input: {
  trigger: TriggerSpec;
  outcome: OutcomeSpec;
  eventsByEntity: Map<string, StreamEvent[]>;
  entityIds: string[];
  archiveEnd: Date;
}): BacktestResult {
  const { trigger, outcome, eventsByEntity, entityIds, archiveEnd } = input;
  const archiveEndMs = archiveEnd.getTime();
  const lookbackMs = maxWindowDays(trigger) * DAY_MS;
  const horizonMs = outcome.horizonDays * DAY_MS;
  const deviationCats = new Set(
    trigger.all.filter((c) => c.kind === "deviation").flatMap((c) => c.categories),
  );

  const episodes: BacktestEpisode[] = [];
  for (const entityId of entityIds) {
    const raw = (eventsByEntity.get(entityId) ?? []).filter(
      (e) => e.kind === "event",
    );
    if (raw.length === 0) continue;
    const covStartMs = Math.min(...raw.map((e) => e.at.getTime()));
    // An entity contributes firing opportunities only once its stream could
    // satisfy the longest window (coverage gating — no cold-start firings).
    const gridStart = ceilDay(covStartMs + lookbackMs);
    if (gridStart > archiveEndMs) continue;

    const events =
      deviationCats.size === 0
        ? raw
        : [
            ...raw,
            ...sweepDeviationEvents({
              entityId,
              events: raw,
              categories: deviationCats,
              fromMs: ceilDay(covStartMs),
              toMs: archiveEndMs,
            }),
          ];

    let prevFired = false;
    let t = gridStart;
    while (t <= archiveEndMs) {
      const r = evaluateTrigger(trigger, events, new Date(t));
      if (r.fired && !prevFired) {
        const firedAt = new Date(t);
        if (t + horizonMs <= archiveEndMs) {
          const o = evaluateOutcome(outcome, raw, firedAt);
          episodes.push({
            entityId,
            firedAt,
            outcome: o.hit ? "hit" : "miss",
            matchId: o.matchId,
            leadDays: o.leadDays,
          });
        } else {
          // Horizon straddles the archive edge — reported, excluded from n.
          episodes.push({
            entityId,
            firedAt,
            outcome: "unresolved",
            matchId: null,
            leadDays: null,
          });
        }
        // Refractory: outcome windows per (pattern, entity) are disjoint, so
        // one real-world outcome corroborates at most one firing — a trigger
        // that stays hot cannot inflate precision.
        t += horizonMs + DAY_MS;
        prevFired = false;
        continue;
      }
      prevFired = r.fired;
      t += DAY_MS;
    }
  }

  const hits = episodes.filter((e) => e.outcome === "hit").length;
  const misses = episodes.filter((e) => e.outcome === "miss").length;
  const unresolved = episodes.length - hits - misses;
  const n = hits + misses;
  return {
    n,
    hits,
    misses,
    unresolved,
    precision: n > 0 ? hits / n : null,
    wilsonLcb: n > 0 ? wilsonLower(hits, n, 1.2816) : null,
    leadTimeDays: leadTimeQuantiles(
      episodes.flatMap((e) => (e.leadDays === null ? [] : [e.leadDays])),
    ),
    episodes,
  };
}
