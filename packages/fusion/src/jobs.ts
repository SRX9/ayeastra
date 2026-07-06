import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";

import {
  buildFactSheet,
  refsToEvidenceIds,
  verifyInsight,
} from "@ayeastra/ai";
import { currentContext } from "@ayeastra/core";
import {
  baselineDeviations,
  changes,
  costEvents,
  deliveries,
  entities,
  entityRelations,
  evidence,
  getDb,
  insights,
  orgEntities,
  patternPredictions,
  patterns,
  scopedDb,
  signals,
  sources,
  type Database,
} from "@ayeastra/db";
import { localHourIn, routeSignal } from "@ayeastra/delivery";
import { defineJob } from "@ayeastra/jobs";

import { detectBurst, detectInflections, deviationDedupKey } from "./baseline";
import { backtestPattern } from "./backtest";
import { detectCohortEvents } from "./cohort";
import {
  alertEligible,
  type FusionCandidate,
  governCandidates,
  planScanCandidates,
  rankCandidates,
  renderDeviationStats,
} from "./governor";
import {
  applyBacktest,
  firableValidated,
  type PatternRow,
  patternEntityUniverse,
  readValidation,
  renderTrackRecord,
  SEED_PATTERNS,
  shouldRetire,
} from "./lifecycle";
import { mineLeadLag } from "./miner";
import {
  foldLiveResolution,
  makePrediction,
  resolvePrediction,
} from "./predictions";
import {
  DAY_MS,
  eventsFromChanges,
  eventsFromDeviations,
  type StreamEvent,
  weekIndex,
  weekStart,
} from "./streams";
import {
  evaluateTrigger,
  parseOutcomeSpec,
  parseTriggerSpec,
  specHash,
} from "./trigger";

/**
 * The fusion package's single impure edge — three jobs, all math delegated
 * to the pure modules (which is where the tests live). Trigger.dev wiring
 * rides the existing @ayeastra/jobs adapters when the trigger app lands.
 *
 *  fusion.observe   daily, GLOBAL — baselines → deviations → cohort events →
 *                   validated-pattern firings → prediction resolution.
 *  fusion.scan      daily, per-org — candidates → governor → verifier →
 *                   insights (+ CRITICAL alert when a validated pattern
 *                   fires on a primary competitor with a priority attached).
 *  fusion.backtest  weekly, GLOBAL — seed → re-backtest all → mine new
 *                   candidates from the archive.
 */

const DEVIATION_LOOKBACK_DAYS = 180; // ≥ max trigger window
const SCAN_DEVIATION_FRESH_DAYS = 14;
const SCAN_FIRING_FRESH_DAYS = 7;
const FACT_FALLBACK_LIMIT = 6;

/** Global observation stream: material, categorized changes per entity. */
async function loadGlobalEvents(db: Database): Promise<{
  eventsByEntity: Map<string, StreamEvent[]>;
  allEntityIds: string[];
}> {
  const rows = await db
    .select({
      id: changes.id,
      entityId: sources.entityId,
      category: changes.category,
      detectedAt: changes.detectedAt,
    })
    .from(changes)
    .innerJoin(sources, eq(changes.sourceId, sources.id))
    .where(and(eq(changes.materiality, "material"), isNotNull(changes.category)));
  const eventsByEntity = new Map<string, StreamEvent[]>();
  for (const e of eventsFromChanges(
    rows.map((r) => ({ ...r, category: r.category! })),
  )) {
    const arr = eventsByEntity.get(e.entityId) ?? [];
    arr.push(e);
    eventsByEntity.set(e.entityId, arr);
  }
  return { eventsByEntity, allEntityIds: [...eventsByEntity.keys()] };
}

async function loadRelations(db: Database) {
  return db
    .select({
      parentId: entityRelations.parentId,
      childId: entityRelations.childId,
      relation: entityRelations.relation,
    })
    .from(entityRelations);
}

export const fusionObserve = defineJob({
  name: "fusion.observe",
  payload: z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  idempotencyKey: (p) => `fusion.observe:${p.day}`,
  run: async (payload) => {
    const db = getDb();
    const day = new Date(`${payload.day}T00:00:00Z`);
    const weekIdx = weekIndex(day);
    const { eventsByEntity, allEntityIds } = await loadGlobalEvents(db);

    // 1) Baseline deviations — stateless recompute, per (entity, category).
    for (const [entityId, events] of eventsByEntity) {
      const categories = [...new Set(events.map((e) => e.category))];
      for (const category of categories) {
        const detections = [
          detectBurst({ entityId, events, category, asOf: day }),
          ...detectInflections({
            entityId,
            events,
            category,
            throughWeek: weekIdx - 1,
          }).filter((d) => weekIndex(d.windowEnd) === weekIdx),
        ].filter((d) => d !== null);
        for (const d of detections) {
          await db
            .insert(baselineDeviations)
            .values({
              ...d,
              // Categories originate from the signal_category-typed changes
              // query above; StreamEvent just widens them to string.
              category: d.category as (typeof baselineDeviations.$inferInsert)["category"],
              dedupKey: deviationDedupKey(d),
            })
            .onConflictDoNothing();
        }
      }
    }

    // 2) Cohort co-movement over this week's deviations.
    const relations = await loadRelations(db);
    const thisWeek = await db
      .select()
      .from(baselineDeviations)
      .where(
        and(
          gte(baselineDeviations.windowEnd, weekStart(weekIdx)),
          sql`${baselineDeviations.windowEnd} < ${weekStart(weekIdx + 1)}`,
        ),
      );
    for (const c of detectCohortEvents({ deviations: thisWeek, relations, weekIdx })) {
      await db
        .insert(baselineDeviations)
        .values({
          entityId: c.marketEntityId,
          category: c.category as (typeof baselineDeviations.$inferInsert)["category"],
          kind: "cohort",
          windowStart: c.windowStart,
          windowEnd: c.windowEnd,
          observed: c.observed,
          expected: c.expected,
          pValue: c.pValue,
          sigmaEquiv: c.sigmaEquiv,
          stats: { memberEntityIds: c.memberEntityIds },
          dedupKey: `${c.marketEntityId}:${c.category}:cohort:${c.weekIdx}`,
        })
        .onConflictDoNothing();
    }

    // 3) Validated-pattern firings → the prediction ledger. Live stream ≡
    //    backtest stream: same changes, same deviation rows, same evaluator.
    const patternRows = (await db
      .select()
      .from(patterns)
      .where(sql`${patterns.status} != 'retired'`)) as unknown as PatternRow[];
    const deviationRows = await db
      .select()
      .from(baselineDeviations)
      .where(
        gte(
          baselineDeviations.windowEnd,
          new Date(day.getTime() - DEVIATION_LOOKBACK_DAYS * DAY_MS),
        ),
      );
    const deviationsByEntity = new Map<string, StreamEvent[]>();
    for (const e of eventsFromDeviations(deviationRows)) {
      const arr = deviationsByEntity.get(e.entityId) ?? [];
      arr.push(e);
      deviationsByEntity.set(e.entityId, arr);
    }

    for (const pattern of firableValidated(patternRows)) {
      const trigger = parseTriggerSpec(pattern.triggerSpec);
      const horizonDays = z
        .object({ horizonDays: z.number() })
        .parse(pattern.outcomeSpec).horizonDays;
      const universe = patternEntityUniverse(pattern, { allEntityIds, relations });
      for (const entityId of universe) {
        const events = [
          ...(eventsByEntity.get(entityId) ?? []),
          ...(deviationsByEntity.get(entityId) ?? []),
        ];
        if (events.length === 0) continue;
        if (!evaluateTrigger(trigger, events, day).fired) continue;
        // Live refractory ≡ backtest refractory: no overlapping horizons.
        const recent = await db
          .select({ id: patternPredictions.id })
          .from(patternPredictions)
          .where(
            and(
              eq(patternPredictions.patternId, pattern.id),
              eq(patternPredictions.entityId, entityId),
              gte(
                patternPredictions.firedAt,
                new Date(day.getTime() - horizonDays * DAY_MS),
              ),
            ),
          )
          .limit(1);
        if (recent.length > 0) continue;
        await db
          .insert(patternPredictions)
          .values(makePrediction(pattern, entityId, day))
          .onConflictDoNothing();
      }
    }

    // 4) Resolve the ledger: hit as soon as the outcome lands, miss at
    //    horizon expiry; fold into validation.live; retire on decay.
    const pending = await db
      .select()
      .from(patternPredictions)
      .where(eq(patternPredictions.outcome, "pending"));
    const patternById = new Map(patternRows.map((p) => [p.id, p]));
    for (const prediction of pending) {
      const pattern = patternById.get(prediction.patternId);
      if (!pattern) continue;
      const events = eventsByEntity.get(prediction.entityId) ?? [];
      const r = resolvePrediction(prediction, pattern.outcomeSpec, events, day);
      if (r.outcome === "pending") continue;
      await db
        .update(patternPredictions)
        .set({
          outcome: r.outcome,
          resolvedAt: day,
          outcomeChangeId: r.matchId,
        })
        .where(eq(patternPredictions.id, prediction.id));
      const validation = foldLiveResolution(pattern.validation, r.outcome);
      const retire = shouldRetire(validation);
      await db
        .update(patterns)
        .set({
          validation,
          updatedAt: day,
          ...(retire ? { status: "retired" as const, retiredAt: day } : {}),
        })
        .where(eq(patterns.id, pattern.id));
      pattern.validation = validation;
      if (retire) pattern.status = "retired";
    }
  },
});

export const fusionScan = defineJob({
  name: "fusion.scan",
  payload: z.object({
    orgId: z.string().min(1),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  idempotencyKey: (p) => `fusion.scan:${p.orgId}:${p.day}`,
  run: async (payload, ctx) => {
    const db = getDb();
    const scoped = scopedDb(payload.orgId, db);
    const day = new Date(`${payload.day}T00:00:00Z`);

    const watchedRows = await scoped.select(orgEntities);
    const watched = watchedRows
      .filter((w) => w.archivedAt === null)
      .map((w) => ({ entityId: w.entityId, tier: w.tier }));
    if (watched.length === 0) return;
    const watchedIds = watched.map((w) => w.entityId);

    const orgSignals = await scoped.select(
      signals,
      gte(signals.createdAt, new Date(day.getTime() - 90 * DAY_MS)),
    );
    const deviationRows = await db
      .select()
      .from(baselineDeviations)
      .where(
        and(
          inArray(baselineDeviations.entityId, watchedIds),
          gte(
            baselineDeviations.windowEnd,
            new Date(day.getTime() - SCAN_DEVIATION_FRESH_DAYS * DAY_MS),
          ),
        ),
      );
    const firingRows = await db
      .select()
      .from(patternPredictions)
      .where(
        and(
          inArray(patternPredictions.entityId, watchedIds),
          gte(
            patternPredictions.firedAt,
            new Date(day.getTime() - SCAN_FIRING_FRESH_DAYS * DAY_MS),
          ),
        ),
      );
    const patternRows = (await db
      .select()
      .from(patterns)) as unknown as PatternRow[];

    const candidates = planScanCandidates({
      day,
      watched,
      signals: orgSignals,
      deviations: deviationRows,
      firings: firingRows,
      patterns: patternRows,
    });
    if (candidates.length === 0) return;

    // Governor: dedup against existing insights + weekly/daily budgets.
    const recentInsights = await scoped.select(
      insights,
      gte(insights.createdAt, new Date(day.getTime() - 30 * DAY_MS)),
    );
    const [{ n: verifiedToday }] = (await db
      .select({ n: sql<number>`count(*)::int` })
      .from(costEvents)
      .where(
        and(
          eq(costEvents.workosOrgId, payload.orgId),
          eq(costEvents.taskName, "verify-insight"),
          gte(costEvents.at, day),
        ),
      )) as [{ n: number }];
    const governed = governCandidates({
      ranked: rankCandidates(candidates),
      existingDedupKeys: new Set(recentInsights.map((i) => i.dedupKey)),
      insightsThisWeek: recentInsights.filter(
        (i) => i.createdAt >= weekStart(weekIndex(day)),
      ).length,
      verifiedToday,
    });
    if (governed.length === 0) return;

    const context = await currentContext(scoped);
    if (!context) return; // no activated context — nothing to ground against
    const signalById = new Map(orgSignals.map((s) => [s.id, s]));
    const deviationById = new Map(deviationRows.map((d) => [d.id, d]));
    const patternById = new Map(patternRows.map((p) => [p.id, p]));

    for (const candidate of governed) {
      const facts = await buildCandidateFacts(db, candidate, signalById);
      if (facts.length === 0) continue; // no evidence-backed facts → no claim
      const sheet = buildFactSheet(facts);
      const deviationRow = candidate.deviationId
        ? deviationById.get(candidate.deviationId)
        : undefined;
      const pattern = candidate.patternId
        ? patternById.get(candidate.patternId)
        : undefined;

      const out = await verifyInsight.run(
        {
          kind: candidate.kind,
          entityName: await entityName(db, candidate.entityId),
          hypothesis: candidate.hypothesis,
          stats: deviationRow ? renderDeviationStats(deviationRow) : null,
          trackRecord: pattern
            ? renderTrackRecord(readValidation(pattern.validation))
            : null,
          facts: sheet.facts.map((f) => ({ ref: f.ref, text: f.text })),
          context: {
            positioning: context.payload.positioning.statement,
            priorities: context.payload.priorities
              .filter((p) => p.status === "active")
              .map((p) => ({ id: p.id, text: p.text })),
          },
        },
        { orgId: payload.orgId, jobRunId: ctx.jobRunId },
      );
      if (!out.isRealPattern) continue; // rejection persists nothing

      const [insight] = await scoped
        .insert(insights, {
          kind: candidate.kind,
          entityId: candidate.entityId,
          signalIds: candidate.signalIds,
          patternId: candidate.patternId ?? null,
          predictionId: candidate.predictionId ?? null,
          pattern: out.pattern,
          analysis: out.analysis,
          forwardLook: out.forwardLook,
          recommendedActions: out.recommendedActions,
          confidence: out.confidence,
          confidenceNotes: out.confidenceNotes,
          evidenceIds: refsToEvidenceIds(sheet, out.refs),
          dedupKey: candidate.dedupKey,
        })
        .onConflictDoNothing()
        .returning();
      if (!insight) continue;

      // CRITICAL-style alert: validated pattern × primary tier × priority.
      if (
        !pattern ||
        !alertEligible({
          kind: candidate.kind,
          patternStatus: candidate.patternStatus ?? null,
          tier: candidate.tier,
          hasPriorityAttachment: candidate.hasPriorityAttachment,
        })
      ) {
        continue;
      }
      const trigger = parseTriggerSpec(pattern.triggerSpec);
      const category =
        trigger.all.find((c) => c.kind === "event")?.categories[0] ?? "other";
      const now = new Date();
      const decision = routeSignal({
        signal: { id: insight.id, entityId: candidate.entityId, category, severity: "critical" },
        config: {
          channels: context.payload.delivery.alertRouting,
          quietHours: null, // CRITICAL is quiet-hours exempt regardless
          timezone: context.payload.delivery.timezone,
        },
        now,
        recentAlerts: [], // pattern firings are ledger-deduped upstream
        mutes: [],
        localHour: localHourIn(context.payload.delivery.timezone, now),
      });
      if (decision.kind === "immediate") {
        for (const channel of decision.channels) {
          await scoped.insert(deliveries, {
            channel,
            targetType: "insight",
            targetId: insight.id,
            status: "queued",
          });
        }
      }
    }
  },
});

export const fusionBacktest = defineJob({
  name: "fusion.backtest",
  payload: z.object({ week: z.string().regex(/^\d{4}-W\d{2}$/) }),
  idempotencyKey: (p) => `fusion.backtest:${p.week}`,
  run: async () => {
    const db = getDb();
    const now = new Date();

    // 0) Idempotent seeding — analyst hypotheses enter as candidates.
    for (const seed of SEED_PATTERNS) {
      await db
        .insert(patterns)
        .values({
          scope: seed.scope,
          entityId: seed.entityId,
          claim: seed.claim,
          triggerSpec: seed.trigger,
          outcomeSpec: seed.outcome,
          specHash: specHash({
            scope: seed.scope,
            entityId: seed.entityId,
            trigger: seed.trigger,
            outcome: seed.outcome,
          }),
          source: "analyst",
        })
        .onConflictDoNothing();
    }

    const { eventsByEntity, allEntityIds } = await loadGlobalEvents(db);
    const relations = await loadRelations(db);
    // Reduce, never spread — Math.min(...archive) blows the engine argument
    // limit once the global archive passes ~65k events.
    let archiveStartMs = now.getTime();
    for (const events of eventsByEntity.values()) {
      for (const e of events) {
        if (e.at.getTime() < archiveStartMs) archiveStartMs = e.at.getTime();
      }
    }
    const archiveStart = new Date(archiveStartMs);

    // 1) Re-backtest every non-retired pattern over the grown archive.
    const rows = (await db
      .select()
      .from(patterns)
      .where(sql`${patterns.status} != 'retired'`)) as unknown as PatternRow[];
    for (const pattern of rows) {
      const result = backtestPattern({
        trigger: parseTriggerSpec(pattern.triggerSpec),
        outcome: parseOutcomeSpec(pattern.outcomeSpec),
        eventsByEntity,
        entityIds: patternEntityUniverse(pattern, { allEntityIds, relations }),
        archiveEnd: now,
      });
      const applied = applyBacktest(pattern, result, { archiveStart, archiveEnd: now }, now);
      await db
        .update(patterns)
        .set({ status: applied.status, validation: applied.validation, updatedAt: now })
        .where(eq(patterns.id, pattern.id));
    }

    // 2) Mine the archive for new auto candidates (FDR-gated), spec-deduped.
    for (const mined of mineLeadLag({ eventsByEntity, entityIds: allEntityIds, asOf: now })) {
      await db
        .insert(patterns)
        .values({
          scope: mined.scope,
          entityId: mined.entityId,
          claim: mined.claim,
          triggerSpec: mined.trigger,
          outcomeSpec: mined.outcome,
          specHash: specHash({
            scope: mined.scope,
            entityId: mined.entityId,
            trigger: mined.trigger,
            outcome: mined.outcome,
          }),
          source: "auto",
          validation: { discovery: mined.discovery },
        })
        .onConflictDoNothing();
    }
  },
});

// ── helpers ──────────────────────────────────────────────────────────────

async function entityName(db: Database, entityId: string): Promise<string> {
  const [row] = await db
    .select({ name: entities.canonicalName })
    .from(entities)
    .where(eq(entities.id, entityId));
  return row?.name ?? "the entity";
}


/**
 * Evidence-backed facts for the verifier: constituent signals first; for
 * deviation/pattern candidates without org signals, fall back to the
 * entity's recent material changes (their evidence rows chain the claim to
 * the archive). Facts without evidence never enter the sheet — law #1.
 */
async function buildCandidateFacts(
  db: Database,
  candidate: FusionCandidate,
  signalById: Map<string, { finding: string; createdAt: Date; evidenceIds: string[] }>,
): Promise<{ text: string; evidenceId: string }[]> {
  const facts: { text: string; evidenceId: string }[] = [];
  for (const id of candidate.signalIds) {
    const s = signalById.get(id);
    if (!s || s.evidenceIds.length === 0) continue;
    facts.push({
      text: `${s.finding} (${s.createdAt.toISOString().slice(0, 10)})`,
      evidenceId: s.evidenceIds[0]!,
    });
  }
  if (facts.length > 0) return facts;

  const recent = await db
    .select({
      changeId: changes.id,
      summary: changes.summary,
      detectedAt: changes.detectedAt,
      evidenceId: evidence.id,
    })
    .from(changes)
    .innerJoin(sources, eq(changes.sourceId, sources.id))
    .innerJoin(evidence, eq(evidence.changeId, changes.id))
    .where(
      and(
        eq(sources.entityId, candidate.entityId),
        eq(changes.materiality, "material"),
        gte(
          changes.detectedAt,
          new Date(candidate.latestEventAt.getTime() - DEVIATION_LOOKBACK_DAYS * DAY_MS),
        ),
      ),
    )
    .orderBy(desc(changes.detectedAt))
    .limit(FACT_FALLBACK_LIMIT);
  for (const r of recent) {
    if (!r.summary) continue;
    facts.push({
      text: `${r.summary} (${r.detectedAt.toISOString().slice(0, 10)})`,
      evidenceId: r.evidenceId,
    });
  }
  return facts;
}
