import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { uuidv7 } from "../id";
import {
  deviationKind,
  patternScope,
  patternSource,
  patternStatus,
  predictionOutcome,
  signalCategory,
} from "./enums";
import { changes, entities } from "./observation";

/**
 * Phase 3.1 — fusion engine, GLOBAL layer. Patterns describe how the world
 * behaves; they are backtested against global `changes` and must therefore
 * also FIRE against global `changes` (live stream ≡ validated stream, the
 * calibration guarantee). No org column anywhere here (data-model law #3);
 * per-org projection into `insights` happens in fusion.scan via scopedDb.
 */

export const patterns = pgTable(
  "patterns",
  {
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    scope: patternScope("scope").notNull(),
    /** entity scope: the subject; industry scope: the market entity
     * (membership = entity_relations competes_in); null for global. */
    entityId: uuid("entity_id").references(() => entities.id),
    claim: text("claim").notNull(),
    /** TriggerSpec v1 / OutcomeSpec v1 — zod-parsed on every read in
     * @ayeastra/fusion (jsonb is never trusted). */
    triggerSpec: jsonb("trigger_spec").notNull(),
    outcomeSpec: jsonb("outcome_spec").notNull(),
    /** sha256 of (scope, entityId, triggerSpec, outcomeSpec) — dedup key
     * for mined candidates and idempotent seeding. */
    specHash: text("spec_hash").notNull().unique(),
    status: patternStatus("status").default("candidate").notNull(),
    source: patternSource("source").notNull(),
    /** { backtest: {n,hits,misses,unresolved,precision,wilsonLcb,
     *    leadTimeDays,archiveStart,archiveEnd,ranAt}, live: {n,hits,misses},
     *    discovery?: {pValue,lift,q}, history: [last 6 backtest summaries] } */
    validation: jsonb("validation"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    retiredAt: timestamp("retired_at"),
  },
  (t) => [index("patterns_status_idx").on(t.status)],
);

export const baselineDeviations = pgTable(
  "baseline_deviations",
  {
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    /** cohort kind: the market entity; burst/inflection: the subject. */
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id),
    category: signalCategory("category").notNull(),
    kind: deviationKind("kind").notNull(),
    windowStart: timestamp("window_start").notNull(),
    windowEnd: timestamp("window_end").notNull(),
    observed: integer("observed").notNull(),
    expected: real("expected").notNull(),
    pValue: doublePrecision("p_value").notNull(),
    sigmaEquiv: real("sigma_equiv").notNull(),
    /** Detector internals frozen at detection time — narration inputs.
     * burst: {lambda,alpha,windowDays,historyWeeks} · inflection: {s,h,k}
     * · cohort: {memberEntityIds}. */
    stats: jsonb("stats").notNull(),
    /** `${entityId}:${category}:${kind}:${weekIndex}` — one per stream/week. */
    dedupKey: text("dedup_key").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.dedupKey),
    index("baseline_deviations_entity_idx").on(
      t.entityId,
      t.category,
      t.createdAt.desc(),
    ),
  ],
);

/**
 * The live prediction ledger — every validated-pattern firing is a
 * falsifiable claim resolved mechanically against the archive. Rolling
 * hit/miss folds back into patterns.validation (decay → retirement).
 */
export const patternPredictions = pgTable(
  "pattern_predictions",
  {
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    patternId: uuid("pattern_id")
      .notNull()
      .references(() => patterns.id),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id),
    /** Day-bucketed UTC — idempotent firing per (pattern, entity, day). */
    firedAt: timestamp("fired_at").notNull(),
    resolvesBy: timestamp("resolves_by").notNull(),
    outcome: predictionOutcome("outcome").default("pending").notNull(),
    resolvedAt: timestamp("resolved_at"),
    outcomeChangeId: uuid("outcome_change_id").references(() => changes.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.patternId, t.entityId, t.firedAt),
    index("pattern_predictions_pending_idx").on(t.outcome, t.resolvesBy),
  ],
);
