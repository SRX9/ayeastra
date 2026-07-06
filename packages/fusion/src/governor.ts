import {
  correlationDedupKey,
  findInsightCandidates,
  type SignalLite,
} from "@ayeastra/scoring/insights";

import { firableValidated, type PatternRow } from "./lifecycle";
import { DAY_MS } from "./streams";
import { maxWindowDays, parseTriggerSpec } from "./trigger";

/**
 * Deterministic volume control — fusion insights are rare, prominent
 * artifacts (phase doc: single-digit per org per MONTH is success, not
 * failure). The governor runs BEFORE the heavy verifier (cost gate) and its
 * caps bound what can ever persist (volume gate). Ranking is total-ordered:
 * same inputs, same order, always.
 */

export const MAX_INSIGHTS_PER_ORG_PER_WEEK = 2;
export const MAX_VERIFY_PER_ORG_PER_DAY = 3;

const KIND_WEIGHT = { pattern: 3, deviation: 2, correlation: 1 } as const;
const TIER_WEIGHT = { primary: 2, secondary: 1, watch: 0 } as const;
export const SEVERITY_POINTS = {
  critical: 4,
  high: 3,
  notable: 2,
  info: 1,
} as const;

export type FusionKind = keyof typeof KIND_WEIGHT;
export type EntityTier = keyof typeof TIER_WEIGHT;

export interface FusionCandidate {
  kind: FusionKind;
  entityId: string;
  /** corr:{rule}:{entityId}:{week} · dev:{deviationId} · pat:{predictionId}
   * — doubles as insights.dedupKey (insert idempotency). */
  dedupKey: string;
  tier: EntityTier;
  /** Σ SEVERITY_POINTS of constituent org signals. */
  severityMass: number;
  latestEventAt: Date;
  signalIds: string[];
  /** Any constituent signal carries a priority attachment (alert gate). */
  hasPriorityAttachment: boolean;
  /** The claim/rule statement the verifier will judge. */
  hypothesis: string;
  patternId?: string;
  predictionId?: string;
  deviationId?: string;
  rule?: string;
  patternStatus?: string;
}

// Correlation keys are shared with the on-insert grouper in signal.ground —
// both paths import @ayeastra/scoring's correlationDedupKey (ISO-week bucket)
// so neither can mint a key the other's dedup check won't recognize.
export { correlationDedupKey };

export function deviationInsightDedupKey(deviationId: string): string {
  return `dev:${deviationId}`;
}

export function patternInsightDedupKey(predictionId: string): string {
  return `pat:${predictionId}`;
}

/** Desc by (kind, tier, severity mass, recency); dedupKey breaks ties. */
export function rankCandidates(candidates: FusionCandidate[]): FusionCandidate[] {
  return [...candidates].sort(
    (a, b) =>
      KIND_WEIGHT[b.kind] - KIND_WEIGHT[a.kind] ||
      TIER_WEIGHT[b.tier] - TIER_WEIGHT[a.tier] ||
      b.severityMass - a.severityMass ||
      b.latestEventAt.getTime() - a.latestEventAt.getTime() ||
      a.dedupKey.localeCompare(b.dedupKey),
  );
}

/**
 * Which ranked candidates may reach the verifier today: skip anything
 * already covered, spend at most the daily verify budget, and never exceed
 * what the weekly insight cap has left.
 */
export function governCandidates(input: {
  ranked: FusionCandidate[];
  existingDedupKeys: Set<string>;
  insightsThisWeek: number;
  verifiedToday: number;
}): FusionCandidate[] {
  const budget = Math.max(
    0,
    Math.min(
      MAX_VERIFY_PER_ORG_PER_DAY - input.verifiedToday,
      MAX_INSIGHTS_PER_ORG_PER_WEEK - input.insightsThisWeek,
    ),
  );
  const out: FusionCandidate[] = [];
  for (const c of input.ranked) {
    if (out.length >= budget) break;
    if (input.existingDedupKeys.has(c.dedupKey)) continue;
    out.push(c);
  }
  return out;
}

/**
 * The phase-doc CRITICAL-alert rule as one testable predicate: only a
 * VALIDATED pattern firing against a primary-tier entity with an attached
 * priority pages anyone.
 */
export function alertEligible(input: {
  kind: FusionKind;
  patternStatus: string | null;
  tier: EntityTier;
  hasPriorityAttachment: boolean;
}): boolean {
  return (
    input.kind === "pattern" &&
    input.patternStatus === "validated" &&
    input.tier === "primary" &&
    input.hasPriorityAttachment
  );
}

// ── Scan planning (pure — the fusion.scan job is a thin I/O shell) ──────

export interface WatchedEntity {
  entityId: string;
  tier: EntityTier;
}

export type OrgSignal = SignalLite & { priorityAttachments: unknown };

export interface DeviationLite {
  id: string;
  entityId: string;
  category: string;
  kind: string;
  windowEnd: Date;
  observed: number;
  expected: number;
  pValue: number;
  sigmaEquiv: number;
}

export interface FiringLite {
  id: string; // prediction id
  patternId: string;
  entityId: string;
  firedAt: Date;
}

/** Deterministic stats narration — the verifier repeats it, never computes it. */
export function renderDeviationStats(d: DeviationLite): string {
  const p = Number(d.pValue.toPrecision(2));
  if (d.kind === "cohort") {
    return `${d.observed} competitors in the market moved on ${d.category} in the same week (p=${p})`;
  }
  const sigma = Math.round(d.sigmaEquiv * 10) / 10;
  const what =
    d.kind === "burst"
      ? `${d.observed} events in 28 days`
      : `${d.observed} events since the shift began`;
  return `${what} vs ${Math.round(d.expected * 10) / 10} expected from baseline (p=${p}, ${sigma}σ)`;
}

const CORRELATION_WINDOW_DAYS = 30;

const hasAttachment = (s: OrgSignal): boolean =>
  Array.isArray(s.priorityAttachments) && s.priorityAttachments.length > 0;

/**
 * Compose the day's fusion candidates for one org: widened correlation
 * groupers over org signals, unconsumed deviations on watched entities, and
 * new firings — from VALIDATED patterns only (`firableValidated` is the
 * gate: candidate/retired patterns yield nothing here, ever).
 */
export function planScanCandidates(input: {
  day: Date;
  watched: WatchedEntity[];
  signals: OrgSignal[];
  deviations: DeviationLite[];
  firings: FiringLite[];
  patterns: PatternRow[];
}): FusionCandidate[] {
  const tierByEntity = new Map(input.watched.map((w) => [w.entityId, w.tier]));
  const signalById = new Map(input.signals.map((s) => [s.id, s]));
  const out: FusionCandidate[] = [];

  // Correlations: trailing 30-day window, watched entities only.
  const windowStart = input.day.getTime() - CORRELATION_WINDOW_DAYS * DAY_MS;
  const windowSignals = input.signals.filter(
    (s) =>
      tierByEntity.has(s.entityId) &&
      s.createdAt.getTime() > windowStart &&
      s.createdAt.getTime() <= input.day.getTime(),
  );
  for (const c of findInsightCandidates(windowSignals)) {
    const constituents = c.signalIds.map((id) => signalById.get(id)!);
    out.push({
      kind: "correlation",
      entityId: c.entityId,
      dedupKey: correlationDedupKey(c.rule, c.entityId, input.day),
      tier: tierByEntity.get(c.entityId)!,
      severityMass: constituents.reduce(
        (sum, s) => sum + SEVERITY_POINTS[s.severity],
        0,
      ),
      latestEventAt: new Date(
        Math.max(...constituents.map((s) => s.createdAt.getTime())),
      ),
      signalIds: c.signalIds,
      hasPriorityAttachment: constituents.some(hasAttachment),
      hypothesis: `Correlated ${c.rule.replace(/_/g, " ")} activity on one entity within the trailing 30-day window.`,
      rule: c.rule,
    });
  }

  // Deviations on watched entities (cohort deviations ride watched markets).
  const hypothesisByKind: Record<string, (cat: string) => string> = {
    burst: (cat) => `${cat} activity accelerated far beyond this entity's baseline.`,
    inflection: (cat) => `${cat} cadence shifted to a sustained new level.`,
    cohort: (cat) => `Market-wide ${cat} movement across competitors in the same week.`,
  };
  for (const d of input.deviations) {
    const tier = tierByEntity.get(d.entityId);
    if (!tier) continue;
    out.push({
      kind: "deviation",
      entityId: d.entityId,
      dedupKey: deviationInsightDedupKey(d.id),
      tier,
      severityMass: 0,
      latestEventAt: d.windowEnd,
      signalIds: [],
      hasPriorityAttachment: false,
      hypothesis: (hypothesisByKind[d.kind] ?? hypothesisByKind.burst!)(d.category),
      deviationId: d.id,
    });
  }

  // Pattern firings — the mechanical gate: only firableValidated patterns.
  const validated = new Map(
    firableValidated(input.patterns).map((p) => [p.id, p]),
  );
  for (const f of input.firings) {
    const pattern = validated.get(f.patternId);
    const tier = tierByEntity.get(f.entityId);
    if (!pattern || !tier) continue;
    const trigger = parseTriggerSpec(pattern.triggerSpec);
    const eventCats = new Set<string>(
      trigger.all.filter((c) => c.kind === "event").flatMap((c) => c.categories),
    );
    const lookback = f.firedAt.getTime() - maxWindowDays(trigger) * DAY_MS;
    const constituents = input.signals.filter(
      (s) =>
        s.entityId === f.entityId &&
        eventCats.has(s.category) &&
        s.createdAt.getTime() > lookback &&
        s.createdAt.getTime() <= f.firedAt.getTime() + DAY_MS,
    );
    out.push({
      kind: "pattern",
      entityId: f.entityId,
      dedupKey: patternInsightDedupKey(f.id),
      tier,
      severityMass: constituents.reduce(
        (sum, s) => sum + SEVERITY_POINTS[s.severity],
        0,
      ),
      latestEventAt: f.firedAt,
      signalIds: constituents.map((s) => s.id),
      hasPriorityAttachment: constituents.some(hasAttachment),
      hypothesis: pattern.claim,
      patternId: pattern.id,
      predictionId: f.id,
      patternStatus: pattern.status,
    });
  }

  return out;
}
