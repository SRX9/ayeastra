import {
  assertValidated,
  type PatternValidation,
  readValidation,
  type ValidatedPattern,
} from "./lifecycle";
import { DAY_MS, type StreamEvent } from "./streams";
import { evaluateOutcome, parseOutcomeSpec } from "./trigger";

/**
 * The live prediction ledger: every validated-pattern firing is a
 * falsifiable, mechanically-resolvable claim. Resolution feeds rolling
 * precision (decay → retirement) and the user-facing track record — the
 * pattern keeps earning its right to speak.
 */

export interface PredictionDraft {
  patternId: string;
  entityId: string;
  firedAt: Date; // day-bucketed UTC → unique(pattern, entity, day)
  resolvesBy: Date;
}

/**
 * Only a ValidatedPattern can create predictions — the branded type makes a
 * candidate firing a compile error; the assertion backstops runtime.
 */
export function makePrediction(
  pattern: ValidatedPattern,
  entityId: string,
  firedAt: Date,
): PredictionDraft {
  assertValidated(pattern);
  const spec = parseOutcomeSpec(pattern.outcomeSpec);
  const day = new Date(
    Math.floor(firedAt.getTime() / DAY_MS) * DAY_MS,
  );
  return {
    patternId: pattern.id,
    entityId,
    firedAt: day,
    resolvesBy: new Date(day.getTime() + spec.horizonDays * DAY_MS),
  };
}

/**
 * Resolve against the archive: hit as soon as the outcome appears, miss
 * only once the horizon has fully expired, pending otherwise.
 */
export function resolvePrediction(
  prediction: { firedAt: Date; resolvesBy: Date },
  outcomeSpec: unknown,
  events: StreamEvent[],
  now: Date,
): {
  outcome: "pending" | "hit" | "miss";
  matchId: string | null;
  leadDays: number | null;
} {
  const spec = parseOutcomeSpec(outcomeSpec);
  const r = evaluateOutcome(spec, events, prediction.firedAt);
  if (r.hit) return { outcome: "hit", matchId: r.matchId, leadDays: r.leadDays };
  if (now.getTime() >= prediction.resolvesBy.getTime()) {
    return { outcome: "miss", matchId: null, leadDays: null };
  }
  return { outcome: "pending", matchId: null, leadDays: null };
}

export function foldLiveResolution(
  validation: unknown,
  outcome: "hit" | "miss",
): PatternValidation {
  const v = readValidation(validation);
  const live = v.live ?? { n: 0, hits: 0, misses: 0 };
  return {
    ...v,
    live: {
      n: live.n + 1,
      hits: live.hits + (outcome === "hit" ? 1 : 0),
      misses: live.misses + (outcome === "miss" ? 1 : 0),
    },
  };
}

/**
 * The tenancy-clean outcome join (build checklist #5): the GLOBAL track
 * record comes only from the mechanical ledger; the org's own corroboration
 * is computed at render time inside the org scope via
 * actions(sourceType=insight) → outcomes. Nothing global stores org data.
 */
export function patternCorroboration(input: {
  insightIds: Iterable<string>;
  actions: { id: string; sourceType: string; sourceId: string }[];
  outcomes: { actionId: string }[];
}): string | null {
  const insightIds = new Set(input.insightIds);
  const acted = input.actions.filter(
    (a) => a.sourceType === "insight" && insightIds.has(a.sourceId),
  );
  if (acted.length === 0) return null;
  const actionIds = new Set(acted.map((a) => a.id));
  const logged = input.outcomes.filter((o) => actionIds.has(o.actionId)).length;
  const times = acted.length === 1 ? "once" : `${acted.length} times`;
  const outcomes =
    logged === 1 ? "1 outcome logged" : `${logged} outcomes logged`;
  return `Your team acted on this pattern ${times}; ${outcomes}.`;
}
