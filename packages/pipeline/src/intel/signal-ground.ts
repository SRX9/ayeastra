import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";

import { buildFactSheet, groundSignal, verifyInsight } from "@ayeastra/ai";
import { sectionsForCategory } from "@ayeastra/battlecards";
import { currentContext } from "@ayeastra/core";
import {
  changes,
  entities,
  evidence,
  getDb,
  insights,
  orgEntities,
  orgScoringWeights,
  scopedDb,
  signals,
  sources,
} from "@ayeastra/db";
import { defineJob } from "@ayeastra/jobs";
import { moduleForSignal } from "@ayeastra/modules";
import {
  correlationDedupKey,
  dedupKey,
  findInsightCandidates,
  FOLLOW_UP_SIMILARITY,
  noveltyFactor,
  scoreSignal,
} from "@ayeastra/scoring";

import { publishEmbed, triggerTask } from "../seam";

/**
 * signal.ground (scoring doc) — per watching org: dedup gate → ground-signal
 * → deterministic severity → write the `signals` row → embed → insight
 * groupers on insert → signal.route. The model judges; code decides.
 */

const NOVELTY_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Rule slug → verifier hypothesis (insights v1: rule-triggered, model-verified). */
function ruleHypothesis(rule: string): string {
  return `The org's recent signals for this entity co-occur as "${rule.replace(/_/g, " ")}" within a 30-day window, suggesting one coordinated move.`;
}

export const signalGround = defineJob({
  name: "signal.ground",
  payload: z.object({ orgId: z.string().min(1), changeId: z.uuid() }),
  idempotencyKey: (p) => `ground:${p.changeId}:${p.orgId}`,
  run: async (payload, ctx) => {
    const db = getDb();
    const scoped = scopedDb(payload.orgId, db);

    const context = await currentContext(scoped);
    if (!context) return; // no activated Intelligence Plan — nothing to ground against

    const [change] = await db
      .select({
        id: changes.id,
        materiality: changes.materiality,
        category: changes.category,
        summary: changes.summary,
        extractedFacts: changes.extractedFacts,
        embedding: changes.embedding,
        sourceKind: sources.kind,
        entityId: sources.entityId,
        entityName: entities.canonicalName,
      })
      .from(changes)
      .innerJoin(sources, eq(changes.sourceId, sources.id))
      .innerJoin(entities, eq(sources.entityId, entities.id))
      .where(eq(changes.id, payload.changeId));
    if (!change || change.materiality !== "material" || !change.category) return;

    const [watch] = await scoped.select(orgEntities, eq(orgEntities.entityId, change.entityId));
    if (!watch || watch.archivedAt !== null) return;

    // Dedup gate — exact fact-fingerprint match kills re-detections before
    // grounding spends a model call.
    const key = dedupKey(change.entityId, change.category, change.extractedFacts);
    const dupes = await scoped.select(signals, eq(signals.dedupKey, key));
    if (dupes.length > 0) return;

    // Novelty — max embedding similarity to the org's recent signals for THIS
    // entity. Scoping to the entity matters: two competitors making
    // near-identical moves are two signals, not a follow-up.
    let maxSimilarity: number | null = null;
    if (change.embedding) {
      const vec = sql.raw(`'${JSON.stringify(change.embedding)}'::vector`);
      const [row] = await db
        .select({ max: sql<number | null>`max(1 - (${signals.embedding} <=> ${vec}))` })
        .from(signals)
        .where(
          and(
            scoped.scope(signals),
            eq(signals.entityId, change.entityId),
            isNotNull(signals.embedding),
            gte(signals.createdAt, new Date(Date.now() - NOVELTY_WINDOW_DAYS * DAY_MS)),
          ),
        );
      maxSimilarity = row?.max ?? null;
    }
    if (maxSimilarity !== null && maxSimilarity >= FOLLOW_UP_SIMILARITY) {
      return; // follow-up of an existing signal — linked by the archive, never re-alerted
    }

    // FactSheet: the change summary + code-computed pricing deltas, all
    // chained to the change's evidence rows (facts without evidence never
    // enter the sheet — law #1).
    const evidenceRows = await db
      .select({ id: evidence.id })
      .from(evidence)
      .where(eq(evidence.changeId, change.id));
    if (evidenceRows.length === 0 || !change.summary) return;
    const evidenceId = evidenceRows[0]!.id;
    const factItems = [{ text: `${change.entityName}: ${change.summary}`, evidenceId }];
    const facts = change.extractedFacts as { deltas?: Array<{ plan: string; field: string; before: string | null; after: string | null }> } | null;
    for (const d of facts?.deltas?.slice(0, 10) ?? []) {
      factItems.push({
        text: `${change.entityName} ${d.plan} ${d.field}: ${d.before ?? "—"} → ${d.after ?? "—"}`,
        evidenceId,
      });
    }
    // Market Watch items (keyword feeds): one fact line per relevant item —
    // summary plus its verbatim-grounded label/value pairs.
    const market = change.extractedFacts as {
      kind?: string;
      items?: Array<{ summary: string; facts: Array<{ label: string; value: string }> }>;
    } | null;
    if (market?.kind === "market_items") {
      for (const item of market.items?.slice(0, 6) ?? []) {
        const details = item.facts
          .slice(0, 3)
          .map((f) => `${f.label}: ${f.value}`)
          .join("; ");
        factItems.push({
          text: details ? `${item.summary} (${details})` : item.summary,
          evidenceId,
        });
      }
    }
    const sheet = buildFactSheet(factItems);

    const ground = await groundSignal.run(
      {
        entityName: change.entityName,
        changeSummary: change.summary,
        facts: sheet.facts.map((f) => ({ ref: f.ref, text: f.text })),
        context: {
          positioning: context.payload.positioning,
          segments: context.payload.segments.map((s) => ({ name: s.name, priority: s.priority })),
          priorities: context.payload.priorities
            .filter((p) => p.status === "active")
            .map((p) => ({ id: p.id, text: p.text, rank: p.rank })),
        },
      },
      { orgId: payload.orgId, entityId: change.entityId, jobRunId: ctx.jobRunId },
    );

    const [weight] = await scoped.select(
      orgScoringWeights,
      and(
        eq(orgScoringWeights.entityId, change.entityId),
        eq(orgScoringWeights.category, change.category),
      ),
    );

    const hasAttachment =
      ground.attachedPriorities.length > 0 ||
      ground.attachedSegments.length > 0 ||
      ground.positioningImpact.affected;

    const decomposition = scoreSignal({
      materiality: change.materiality,
      sourceKind: change.sourceKind,
      category: change.category,
      tier: watch.tier,
      importance: watch.importance,
      grounding: ground.relevance,
      noveltyFactor: noveltyFactor(maxSimilarity),
      feedbackAdjust: weight?.multiplier ?? 1,
      confidence: ground.confidence,
      hasAttachment,
    });

    const priorityAttachments = [
      ...ground.attachedPriorities.map((a) => ({ priorityId: a.priorityId, how: a.how })),
      ...ground.attachedSegments.map((a) => ({ segment: a.segment, how: a.how })),
      ...(ground.positioningImpact.affected
        ? [{ positioningRisk: ground.positioningImpact.talkTrackAtRisk ?? ground.positioningImpact.how }]
        : []),
    ];

    const [signal] = await scoped
      .insert(signals, {
        changeId: change.id,
        entityId: change.entityId,
        category: change.category,
        moduleKey: moduleForSignal({ category: change.category, entityRole: watch.role }),
        severity: decomposition.severity,
        confidence: ground.confidence,
        finding: change.summary,
        whyItMatters: ground.whyItMatters,
        recommendedAction: ground.recommendedAction,
        confidenceNotes: ground.confidenceNotes,
        priorityAttachments,
        contextVersion: context.version,
        scores: decomposition,
        evidenceIds: evidenceRows.map((e) => e.id),
        dedupKey: key,
      })
      .returning({ id: signals.id });
    if (!signal) return;

    await publishEmbed({ target: "signal", id: signal.id });

    await runInsightGroupers({
      db,
      scoped,
      orgId: payload.orgId,
      newSignalId: signal.id,
      entityId: change.entityId,
      entityName: change.entityName,
      context,
      jobRunId: ctx.jobRunId,
    });

    await triggerTask(
      "signal.route",
      { orgId: payload.orgId, signalId: signal.id },
      { idempotencyKey: `route:${signal.id}`, orgId: payload.orgId },
    );

    // Battlecard-relevant categories refresh the entity's card (event-driven).
    if (sectionsForCategory(change.category).length > 0) {
      await triggerTask(
        "battlecard.refresh",
        { orgId: payload.orgId, signalId: signal.id },
        { idempotencyKey: `battlecard:${signal.id}`, orgId: payload.orgId },
      );
    }
  },
});

/** Insights v1 (scoring doc): rule groupers over the entity's trailing
 * 30 days, run on signal insert; a heavy verifier decides — model says no,
 * nothing persists. */
async function runInsightGroupers(args: {
  db: ReturnType<typeof getDb>;
  scoped: ReturnType<typeof scopedDb>;
  orgId: string;
  newSignalId: string;
  entityId: string;
  entityName: string;
  context: NonNullable<Awaited<ReturnType<typeof currentContext>>>;
  jobRunId: string;
}): Promise<void> {
  const windowStart = new Date(Date.now() - NOVELTY_WINDOW_DAYS * DAY_MS);
  const windowSignals = await args.scoped.select(
    signals,
    and(eq(signals.entityId, args.entityId), gte(signals.createdAt, windowStart)),
  );
  const candidates = findInsightCandidates(
    windowSignals.map((s) => ({
      id: s.id,
      entityId: s.entityId,
      category: s.category,
      severity: s.severity,
      createdAt: s.createdAt,
    })),
  ).filter((c) => c.signalIds.includes(args.newSignalId));

  if (candidates.length === 0) return;
  const now = new Date();
  const byId = new Map(windowSignals.map((s) => [s.id, s]));

  for (const candidate of candidates) {
    // Shared with fusion scan's governor — same rule/entity/week must mint
    // the same insights.dedupKey no matter which path nominates it first.
    const insightKey = correlationDedupKey(candidate.rule, candidate.entityId, now);
    const existing = await args.scoped.select(insights, eq(insights.dedupKey, insightKey));
    if (existing.length > 0) continue;

    const items = candidate.signalIds
      .map((id) => byId.get(id))
      .filter((s): s is NonNullable<typeof s> => !!s && s.evidenceIds.length > 0)
      .map((s) => ({
        text: `${s.finding} (${s.createdAt.toISOString().slice(0, 10)})`,
        evidenceId: s.evidenceIds[0]!,
      }));
    if (items.length === 0) continue;
    const sheet = buildFactSheet(items);

    const out = await verifyInsight.run(
      {
        kind: "correlation",
        entityName: args.entityName,
        hypothesis: ruleHypothesis(candidate.rule),
        stats: null,
        trackRecord: null,
        facts: sheet.facts.map((f) => ({ ref: f.ref, text: f.text })),
        context: {
          positioning: args.context.payload.positioning.statement,
          priorities: args.context.payload.priorities
            .filter((p) => p.status === "active")
            .map((p) => ({ id: p.id, text: p.text })),
        },
      },
      { orgId: args.orgId, entityId: args.entityId, jobRunId: args.jobRunId },
    );
    if (!out.isRealPattern) continue;

    const evidenceIds: string[] = [];
    for (const ref of out.refs) {
      const fact = sheet.facts.find((f) => f.ref === ref);
      if (fact && !evidenceIds.includes(fact.evidenceId)) evidenceIds.push(fact.evidenceId);
    }
    await args.scoped
      .insert(insights, {
        kind: "correlation",
        entityId: candidate.entityId,
        signalIds: candidate.signalIds,
        pattern: out.pattern,
        analysis: out.analysis,
        forwardLook: out.forwardLook,
        recommendedActions: out.recommendedActions,
        confidence: out.confidence,
        confidenceNotes: out.confidenceNotes,
        evidenceIds,
        dedupKey: insightKey,
      })
      .onConflictDoNothing();
  }
}
