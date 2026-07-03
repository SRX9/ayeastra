import { type BacktestResult, type LeadTimeQuantiles, wilsonLower } from "./backtest";
import {
  outcomeSpecSchema,
  type OutcomeSpec,
  type TriggerSpec,
  triggerSpecSchema,
} from "./trigger";

/**
 * Pattern lifecycle — the state machine that decides which claims may ever
 * reach a user. All transitions are pure and deterministic; the model never
 * touches them (law #7). candidate → validated only through the backtest
 * gate; validated → candidate on re-backtest decay (honest demotion, history
 * kept); validated → retired on live decay (terminal — a pattern that made
 * real predictions and failed must re-earn validation as a fresh candidate).
 */

export const VALIDATION_GATE = {
  minN: 5,
  minPrecision: 0.7,
  minWilsonLcb: 0.5,
  wilsonZ: 1.2816, // one-sided 90%
} as const;

export const RETIRE_RULE = {
  minLiveResolutions: 3,
  lcbFloor: 0.35,
} as const;

export const VALIDATION_HISTORY_MAX = 6;

export type PatternStatus = "candidate" | "validated" | "retired";

export interface BacktestSummary {
  n: number;
  hits: number;
  misses: number;
  unresolved: number;
  precision: number | null;
  wilsonLcb: number | null;
  leadTimeDays: LeadTimeQuantiles | null;
  archiveStart: string;
  archiveEnd: string;
  ranAt: string;
}

export interface PatternValidation {
  backtest?: BacktestSummary;
  live?: { n: number; hits: number; misses: number };
  discovery?: { pValue: number; lift: number; q: number };
  history?: BacktestSummary[];
}

/** Structural row shape — drizzle `patterns` rows satisfy it. */
export interface PatternRow {
  id: string;
  scope: "entity" | "industry" | "global";
  entityId: string | null;
  claim: string;
  triggerSpec: unknown;
  outcomeSpec: unknown;
  status: PatternStatus;
  source: "analyst" | "auto";
  validation: unknown;
}

/** validation jsonb is written only by this package; null-safe read. */
export function readValidation(raw: unknown): PatternValidation {
  return (raw ?? {}) as PatternValidation;
}

declare const validated: unique symbol;
/**
 * The mechanical gate (acceptance #2): only this brand can create
 * predictions or pattern-kind insights. A candidate pattern reaching a user
 * is a compile error before it is ever a runtime one.
 */
export type ValidatedPattern = PatternRow & {
  status: "validated";
  readonly [validated]: true;
};

export function firableValidated(rows: PatternRow[]): ValidatedPattern[] {
  return rows.filter((r) => r.status === "validated") as ValidatedPattern[];
}

/** Runtime backstop behind the compile-time brand. */
export function assertValidated(row: PatternRow): asserts row is ValidatedPattern {
  if (row.status !== "validated") {
    throw new Error(
      `pattern ${row.id} is '${row.status}' — forward-looking claims require 'validated'`,
    );
  }
}

export function passesGate(result: {
  n: number;
  precision: number | null;
  wilsonLcb: number | null;
}): boolean {
  return (
    result.n >= VALIDATION_GATE.minN &&
    (result.precision ?? 0) >= VALIDATION_GATE.minPrecision &&
    (result.wilsonLcb ?? 0) >= VALIDATION_GATE.minWilsonLcb
  );
}

/**
 * Fold a fresh backtest into a pattern: status + validation out, nothing
 * mutated. Retired is terminal — decayed patterns re-enter as new rows.
 */
export function applyBacktest(
  pattern: Pick<PatternRow, "status" | "validation">,
  result: BacktestResult,
  window: { archiveStart: Date; archiveEnd: Date },
  now: Date,
): { status: PatternStatus; validation: PatternValidation } {
  const prev = readValidation(pattern.validation);
  const summary: BacktestSummary = {
    n: result.n,
    hits: result.hits,
    misses: result.misses,
    unresolved: result.unresolved,
    precision: result.precision,
    wilsonLcb: result.wilsonLcb,
    leadTimeDays: result.leadTimeDays,
    archiveStart: window.archiveStart.toISOString(),
    archiveEnd: window.archiveEnd.toISOString(),
    ranAt: now.toISOString(),
  };
  const validation: PatternValidation = {
    ...prev,
    backtest: summary,
    history: [...(prev.history ?? []), summary].slice(-VALIDATION_HISTORY_MAX),
  };
  if (pattern.status === "retired") return { status: "retired", validation };
  return { status: passesGate(result) ? "validated" : "candidate", validation };
}

/**
 * Live decay: with ≥3 live resolutions, the COMBINED (backtest + live)
 * Wilson lower bound dropping under the floor retires the pattern.
 */
export function shouldRetire(validation: PatternValidation): boolean {
  const live = validation.live;
  const bt = validation.backtest;
  if (!live || live.n < RETIRE_RULE.minLiveResolutions) return false;
  const hits = (bt?.hits ?? 0) + live.hits;
  const n = (bt?.n ?? 0) + live.n;
  if (n === 0) return false;
  return wilsonLower(hits, n, VALIDATION_GATE.wilsonZ) < RETIRE_RULE.lcbFloor;
}

/**
 * The user-facing track record — every number comes from validation jsonb,
 * never model prose (law #1). The verifier is instructed to repeat this
 * verbatim.
 */
export function renderTrackRecord(validation: PatternValidation): string {
  const bt = validation.backtest;
  if (!bt || bt.n === 0) return "No resolved backtest episodes yet.";
  const lead = bt.leadTimeDays
    ? `, typically ${bt.leadTimeDays.p25}–${bt.leadTimeDays.p75} days ahead`
    : "";
  const live = validation.live;
  const liveText =
    live && live.n > 0
      ? `; ${live.hits} of ${live.n} live predictions resolved as hits`
      : "";
  return `Preceded ${bt.hits} of ${bt.n} observed outcomes in the archive${lead}${liveText}.`;
}

/**
 * Resolve a pattern's scope to the entity universe it may fire on.
 * entity_relations convention: child <relation> parent — a company (child)
 * competes_in a market (parent), mirroring product_of/subsidiary_of.
 */
export function industryEntityIds(
  marketEntityId: string,
  relations: { parentId: string; childId: string; relation: string }[],
): string[] {
  return relations
    .filter((r) => r.relation === "competes_in" && r.parentId === marketEntityId)
    .map((r) => r.childId);
}

export function patternEntityUniverse(
  pattern: Pick<PatternRow, "scope" | "entityId">,
  world: {
    allEntityIds: string[];
    relations: { parentId: string; childId: string; relation: string }[];
  },
): string[] {
  if (pattern.scope === "entity") return pattern.entityId ? [pattern.entityId] : [];
  if (pattern.scope === "industry") {
    return pattern.entityId
      ? industryEntityIds(pattern.entityId, world.relations)
      : [];
  }
  return world.allEntityIds;
}

// ── Seed library ─────────────────────────────────────────────────────────

export interface SeedPattern {
  claim: string;
  scope: "entity" | "industry" | "global";
  entityId: null;
  trigger: TriggerSpec;
  outcome: OutcomeSpec;
}

/**
 * Analyst-authored candidates — Insights v1 pair rules recast as testable
 * forward claims, plus the doc's flagship expansion-move hypothesis. All
 * enter as `candidate`; only the backtest gate can validate them.
 */
export const SEED_PATTERNS: SeedPattern[] = [
  {
    claim:
      "A funding round, a hiring surge, and a pricing repackage within one quarter precede a launch or market entry within ~4 months.",
    scope: "global",
    entityId: null,
    trigger: triggerSpecSchema.parse({
      v: 1,
      all: [
        { categories: ["funding"], minCount: 1, windowDays: 90 },
        { categories: ["hiring"], minCount: 3, windowDays: 60 },
        { categories: ["pricing", "packaging"], minCount: 1, windowDays: 60 },
      ],
    }),
    outcome: outcomeSpecSchema.parse({
      v: 1,
      categories: ["launch", "market_entry"],
      minCount: 1,
      horizonDays: 120,
    }),
  },
  {
    claim: "A pricing change alongside hiring activity precedes a launch within ~3 months.",
    scope: "global",
    entityId: null,
    trigger: triggerSpecSchema.parse({
      v: 1,
      all: [
        { categories: ["pricing"], minCount: 1, windowDays: 30 },
        { categories: ["hiring"], minCount: 2, windowDays: 45 },
      ],
    }),
    outcome: outcomeSpecSchema.parse({
      v: 1,
      categories: ["launch"],
      minCount: 1,
      horizonDays: 90,
    }),
  },
  {
    claim:
      "A launch accompanied by a messaging shift precedes a pricing or packaging move within ~3 months.",
    scope: "global",
    entityId: null,
    trigger: triggerSpecSchema.parse({
      v: 1,
      all: [
        { categories: ["launch"], minCount: 1, windowDays: 30 },
        { categories: ["messaging"], minCount: 1, windowDays: 30 },
      ],
    }),
    outcome: outcomeSpecSchema.parse({
      v: 1,
      categories: ["pricing", "packaging"],
      minCount: 1,
      horizonDays: 90,
    }),
  },
  {
    claim:
      "A release-cadence acceleration precedes a pricing or packaging move within ~3 months.",
    scope: "global",
    entityId: null,
    trigger: triggerSpecSchema.parse({
      v: 1,
      all: [{ kind: "deviation", categories: ["launch"], minCount: 1, windowDays: 30 }],
    }),
    outcome: outcomeSpecSchema.parse({
      v: 1,
      categories: ["pricing", "packaging"],
      minCount: 1,
      horizonDays: 90,
    }),
  },
];
