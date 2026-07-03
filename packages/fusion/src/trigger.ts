import { createHash } from "node:crypto";

import { signalCategory } from "@ayeastra/db";
import { stableStringify } from "@ayeastra/scoring/dedup";
import { z } from "zod";

import { DAY_MS, type StreamEvent } from "./streams";

/**
 * The one declarative trigger language. One pure evaluator runs it LIVE
 * (asOf = today, over changes/signals) and BACKWARD (asOf swept across the
 * archive) — backtesting is the same evaluator on historical data, so
 * no-lookahead and live/backtest equivalence hold by construction.
 *
 * v1 deliberately has no severity/tier conditions: those are per-org
 * assessments, and a spec validated on the global archive must fire on the
 * exact same stream it was validated against (the calibration guarantee).
 * The `v` field is the door for a future per-org-backtestable v2.
 */

export const triggerConditionSchema = z.object({
  kind: z.enum(["event", "deviation"]).default("event"),
  categories: z.array(z.enum(signalCategory.enumValues)).min(1),
  minCount: z.number().int().min(1).max(20).default(1),
  windowDays: z.number().int().min(7).max(180),
});

export const triggerSpecSchema = z.object({
  v: z.literal(1),
  all: z.array(triggerConditionSchema).min(1).max(4),
});

export const outcomeSpecSchema = z.object({
  v: z.literal(1),
  categories: z.array(z.enum(signalCategory.enumValues)).min(1),
  minCount: z.number().int().min(1).default(1),
  horizonDays: z.number().int().min(7).max(180),
});

export type TriggerCondition = z.output<typeof triggerConditionSchema>;
export type TriggerSpec = z.output<typeof triggerSpecSchema>;
export type OutcomeSpec = z.output<typeof outcomeSpecSchema>;

export class PatternSpecError extends Error {
  constructor(kind: "trigger" | "outcome", issues: string) {
    super(`invalid ${kind} spec: ${issues}`);
    this.name = "PatternSpecError";
  }
}

/** jsonb is never trusted — parse on every read. */
export function parseTriggerSpec(raw: unknown): TriggerSpec {
  const r = triggerSpecSchema.safeParse(raw);
  if (!r.success) throw new PatternSpecError("trigger", r.error.message);
  return r.data;
}

export function parseOutcomeSpec(raw: unknown): OutcomeSpec {
  const r = outcomeSpecSchema.safeParse(raw);
  if (!r.success) throw new PatternSpecError("outcome", r.error.message);
  return r.data;
}

/** Longest condition lookback — the earliest data a firing can depend on. */
export function maxWindowDays(spec: TriggerSpec): number {
  return Math.max(...spec.all.map((c) => c.windowDays));
}

/**
 * A condition is satisfied ⇔ ≥ minCount matching events lie in
 * (asOf − windowDays, asOf]; the spec fires ⇔ every condition is satisfied.
 * Returns the matched event ids so callers can chain evidence.
 */
export function evaluateTrigger(
  spec: TriggerSpec,
  events: StreamEvent[],
  asOf: Date,
): { fired: boolean; matchedIds: string[] } {
  const asOfMs = asOf.getTime();
  const matchedIds: string[] = [];
  for (const cond of spec.all) {
    const cats = new Set<string>(cond.categories);
    const fromMs = asOfMs - cond.windowDays * DAY_MS;
    const inWindow = events.filter(
      (e) =>
        e.kind === cond.kind &&
        cats.has(e.category) &&
        e.at.getTime() > fromMs &&
        e.at.getTime() <= asOfMs,
    );
    if (inWindow.length < cond.minCount) return { fired: false, matchedIds: [] };
    for (const e of inWindow) matchedIds.push(e.id);
  }
  return { fired: true, matchedIds: [...new Set(matchedIds)] };
}

/**
 * hit ⇔ ≥ minCount matching "event"-kind events in (firedAt, firedAt +
 * horizonDays]. matchId is the FIRST match — it becomes the prediction's
 * outcome_change_id; leadDays feeds the empirical hazard profile.
 */
export function evaluateOutcome(
  spec: OutcomeSpec,
  events: StreamEvent[],
  firedAt: Date,
): { hit: boolean; matchId: string | null; leadDays: number | null } {
  const from = firedAt.getTime();
  const to = from + spec.horizonDays * DAY_MS;
  const cats = new Set<string>(spec.categories);
  const matches = events
    .filter(
      (e) =>
        e.kind === "event" &&
        cats.has(e.category) &&
        e.at.getTime() > from &&
        e.at.getTime() <= to,
    )
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  if (matches.length < spec.minCount) {
    return { hit: false, matchId: null, leadDays: null };
  }
  const first = matches[0]!;
  return {
    hit: true,
    matchId: first.id,
    leadDays: Math.round((first.at.getTime() - from) / DAY_MS),
  };
}

/**
 * Stable identity of a pattern's semantics — dedup key for mined candidates
 * and idempotent seeding. Key order never matters (stableStringify).
 */
export function specHash(input: {
  scope: string;
  entityId: string | null;
  trigger: TriggerSpec;
  outcome: OutcomeSpec;
}): string {
  return createHash("sha256")
    .update(
      stableStringify({
        scope: input.scope,
        entityId: input.entityId,
        trigger: input.trigger,
        outcome: input.outcome,
      }),
    )
    .digest("hex")
    .slice(0, 32);
}
