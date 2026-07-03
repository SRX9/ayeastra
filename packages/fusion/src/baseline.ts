import {
  DAY_MS,
  EPOCH_UTC,
  type StreamEvent,
  WEEK_MS,
  weekEnd,
  weekIndex,
  weekStart,
} from "./streams";

/**
 * Per-entity temporal baselines over sparse event streams — statistics in
 * code, never model vibes (fusion doc mechanism #2). Two detectors because
 * "acceleration" and "inflection" are different phenomena:
 *
 *  - burst: Poisson upper-tail p on the trailing 28-day count against an
 *    EWMA weekly rate. z-scores on EWMA stddev are dishonest at counts this
 *    small; the Poisson tail is an actual p-value.
 *  - inflection: one-sided winsorized CUSUM on weekly counts — detects a
 *    SUSTAINED cadence change ("the new normal"), which a tail test
 *    structurally cannot. Winsorizing caps single-week spikes so the burst
 *    detector owns spikes and CUSUM owns shifts.
 *
 * Everything is stateless: recomputed from bucket counts on every run, so
 * live detection and backtest replay are the same fold by construction.
 */

/** Half-life ≈ 6.6 weeks — slower than collection's 0.3; baselines must be stable. */
export const EWMA_ALPHA = 0.1;
export const DETECTION_WINDOW_DAYS = 28;
/** Cold-start gate: no detection before this many complete baseline weeks. */
export const MIN_HISTORY_WEEKS = 8;
/** events/week — rate floor so dormant streams can't produce p ≈ 0. */
export const LAMBDA_FLOOR = 0.05;
/** A lone event is never a spike, whatever the baseline says. */
export const MIN_WINDOW_EVENTS = 3;
/** ≈ 2.6σ one-sided — calibrated so "quarterly shipper does 3 in 28d"
 * (p ≈ 0.004) fires and noise does not. */
export const DEVIATION_P_THRESHOLD = 0.005;
export const CUSUM_SLACK_FACTOR = 0.5;
export const CUSUM_H_FACTOR = 4;
/** Weekly counts are clipped at ref + 2·max(√ref, 0.5) inside CUSUM. */
export const CUSUM_WINSOR_FACTOR = 2;

export interface Deviation {
  entityId: string;
  category: string;
  kind: "burst" | "inflection";
  windowStart: Date;
  windowEnd: Date;
  observed: number;
  expected: number;
  pValue: number;
  sigmaEquiv: number;
  /** Detector internals frozen at detection time — narration inputs only. */
  stats: Record<string, number>;
}

export function deviationDedupKey(d: {
  entityId: string;
  category: string;
  kind: string;
  windowEnd: Date;
}): string {
  return `${d.entityId}:${d.category}:${d.kind}:${weekIndex(d.windowEnd)}`;
}

/** Counts per week over [firstWeek, lastWeek], zeros included. */
export function weeklyCounts(
  events: StreamEvent[],
  category: string,
  firstWeek: number,
  lastWeek: number,
): number[] {
  const counts = new Array<number>(Math.max(0, lastWeek - firstWeek + 1)).fill(0);
  for (const e of events) {
    if (e.category !== category || e.kind !== "event") continue;
    const w = weekIndex(e.at);
    if (w >= firstWeek && w <= lastWeek) counts[w - firstWeek]! += 1;
  }
  return counts;
}

/** EWMA fold seeded with the first bucket. */
export function ewmaRate(counts: number[], alpha = EWMA_ALPHA): number {
  if (counts.length === 0) return 0;
  let lambda = counts[0]!;
  for (let i = 1; i < counts.length; i++) {
    lambda = alpha * counts[i]! + (1 - alpha) * lambda;
  }
  return lambda;
}

/**
 * P(X ≥ k) for X ~ Poisson(mu), computed iteratively — no factorials,
 * deterministic for every realistic k.
 */
export function poissonTailP(k: number, mu: number): number {
  if (k <= 0) return 1;
  let term = Math.exp(-mu);
  let cdf = 0;
  for (let i = 0; i < k; i++) {
    cdf += term;
    term *= mu / (i + 1);
  }
  return Math.min(1, Math.max(1e-300, 1 - cdf));
}

/**
 * P(X ≥ k) for X ~ Binomial(n, p), iterative pmf — the miner's cohort tail
 * and the cohort co-movement p-value both use it.
 */
export function binomialTailP(k: number, n: number, p: number): number {
  if (k <= 0) return 1;
  if (k > n) return 0;
  let term = Math.pow(1 - p, n); // pmf(0)
  let cdf = 0;
  for (let i = 0; i < k; i++) {
    cdf += term;
    term *= ((n - i) / (i + 1)) * (p / (1 - p));
  }
  return Math.min(1, Math.max(1e-300, 1 - cdf));
}

/**
 * Inverse standard-normal CDF (Acklam's rational approximation) — used only
 * to render σ-equivalents in prose; thresholding always uses the p-value.
 */
export function invNormal(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const pLow = 0.02425;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
    );
  }
  if (p <= 1 - pLow) {
    const q = p - 0.5;
    const r = q * q;
    return (
      ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
      (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
    );
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(
    (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
    ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
  );
}

/**
 * First complete week at or after the entity's first event across ALL
 * categories (per-category first-event would bias the rate upward).
 */
export function coverageFirstWeek(events: StreamEvent[]): number | null {
  let min = Infinity;
  for (const e of events) {
    if (e.kind === "event" && e.at.getTime() < min) min = e.at.getTime();
  }
  if (!Number.isFinite(min)) return null;
  return Math.ceil((min - EPOCH_UTC) / WEEK_MS);
}

/**
 * Burst detection at a single asOf — trailing 28-day count vs the EWMA rate
 * of all complete baseline weeks in [coverage, asOf − 28d). Daily-callable:
 * the live job and the backtest grid evaluate the identical formula.
 */
export function detectBurst(input: {
  entityId: string;
  events: StreamEvent[];
  category: string;
  asOf: Date;
}): Deviation | null {
  const { entityId, events, category, asOf } = input;
  const w0 = coverageFirstWeek(events);
  if (w0 === null) return null;

  const cutoffMs = asOf.getTime() - DETECTION_WINDOW_DAYS * DAY_MS;
  // Last week whose end ≤ cutoff.
  const wLast = Math.floor((cutoffMs - EPOCH_UTC) / WEEK_MS - 1);
  const historyWeeks = wLast - w0 + 1;
  if (historyWeeks < MIN_HISTORY_WEEKS) return null;

  const lambda = Math.max(
    ewmaRate(weeklyCounts(events, category, w0, wLast)),
    LAMBDA_FLOOR,
  );

  let observed = 0;
  for (const e of events) {
    if (e.category !== category || e.kind !== "event") continue;
    const t = e.at.getTime();
    if (t > cutoffMs && t <= asOf.getTime()) observed += 1;
  }
  if (observed < MIN_WINDOW_EVENTS) return null;

  const expected = lambda * (DETECTION_WINDOW_DAYS / 7);
  const pValue = poissonTailP(observed, expected);
  if (pValue > DEVIATION_P_THRESHOLD) return null;

  return {
    entityId,
    category,
    kind: "burst",
    windowStart: new Date(cutoffMs),
    windowEnd: asOf,
    observed,
    expected,
    pValue,
    sigmaEquiv: invNormal(1 - pValue),
    stats: {
      lambda,
      alpha: EWMA_ALPHA,
      windowDays: DETECTION_WINDOW_DAYS,
      historyWeeks,
    },
  };
}

/**
 * Inflection detection — one-sided winsorized CUSUM over the full weekly
 * series through `throughWeek`, returning every firing (backtest replay
 * needs historical ones; the live job keeps only the current week's).
 *
 * The reference rate is the lagged running MEAN of all prior complete
 * weeks, recomputed every week: a long mean moves ~1%/week during a real
 * shift so it cannot absorb it (the EWMA would), yet it converges
 * immediately, so quiet periods drain the statistic instead of
 * accumulating false drift. The EWMA stays the burst baseline.
 */
export function detectInflections(input: {
  entityId: string;
  events: StreamEvent[];
  category: string;
  throughWeek: number;
}): Deviation[] {
  const { entityId, events, category, throughWeek } = input;
  const w0 = coverageFirstWeek(events);
  if (w0 === null || throughWeek - w0 + 1 < MIN_HISTORY_WEEKS + 1) return [];

  const counts = weeklyCounts(events, category, w0, throughWeek);
  const firings: Deviation[] = [];

  let sum = counts[0]!;
  let S = 0;
  let spanStart = 0;
  let observedSum = 0;
  let expectedSum = 0;

  for (let i = 1; i < counts.length; i++) {
    if (i >= MIN_HISTORY_WEEKS) {
      if (S === 0) {
        spanStart = i;
        observedSum = 0;
        expectedSum = 0;
      }
      const ref = Math.max(sum / i, LAMBDA_FLOOR); // mean of weeks [0, i)
      const c = counts[i]!;
      const cap = ref + CUSUM_WINSOR_FACTOR * Math.max(Math.sqrt(ref), 0.5);
      const slack = CUSUM_SLACK_FACTOR * ref;
      S = Math.max(0, S + Math.min(c, cap) - ref - slack);
      observedSum += c;
      expectedSum += ref;
      const h = CUSUM_H_FACTOR * Math.max(Math.sqrt(ref), 0.5);
      if (S >= h) {
        const pValue = poissonTailP(observedSum, expectedSum);
        firings.push({
          entityId,
          category,
          kind: "inflection",
          windowStart: weekStart(w0 + spanStart),
          windowEnd: weekEnd(w0 + i),
          observed: observedSum,
          expected: expectedSum,
          pValue,
          sigmaEquiv: invNormal(1 - pValue),
          stats: { s: S, h, k: slack, lambdaRef: ref },
        });
        S = 0; // restart — one firing per crossing episode
      }
    }
    sum += counts[i]!;
  }
  return firings;
}
