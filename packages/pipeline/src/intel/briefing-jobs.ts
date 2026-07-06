import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { z } from "zod";

import { orchestrateBriefing, type GatheredSignal } from "@ayeastra/briefing";
import { currentContext, type ContextVersion } from "@ayeastra/core";
import {
  actions,
  battlecards,
  briefings,
  changes,
  deliveries,
  entities,
  evidence,
  getDb,
  insights,
  missions,
  orgEntities,
  orgModules,
  scopedDb,
  signals,
  sources,
  type Database,
} from "@ayeastra/db";
import { defineJob } from "@ayeastra/jobs";
import { activeModuleKeys } from "@ayeastra/modules";
import { parseMissionBrief } from "@ayeastra/workflow";
import { taskSynth } from "@ayeastra/workflow/jobs";

import { triggerTask } from "../seam";

/**
 * briefing.weekly + briefing.baseline (briefing doc): gather → select →
 * synthesize → QA gate → assemble (all inside orchestrateBriefing) → persist
 * the append-only briefings row → fan out per-channel deliveries. The
 * baseline dossier is the same engine with kind "baseline" — the <24h
 * first-value moment on activation.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const BASELINE_LOOKBACK_DAYS = 30;
const MEMORY_LOOKBACK_DAYS = 90;
const MEMORY_PER_ENTITY = 3;

export const briefingWeekly = defineJob({
  name: "briefing.weekly",
  payload: z.object({
    orgId: z.string().min(1),
    /** Monday of the covered week (period = 7 days from here). */
    periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  idempotencyKey: (p) => `briefing:${p.orgId}:${p.periodStart}`,
  run: async (payload, ctx) => {
    const start = new Date(`${payload.periodStart}T00:00:00Z`);
    const end = new Date(start.getTime() + 7 * DAY_MS);
    await generateBriefing({
      orgId: payload.orgId,
      kind: "weekly",
      windowStart: start,
      windowEnd: end,
      periodStart: payload.periodStart,
      periodEnd: new Date(end.getTime() - DAY_MS).toISOString().slice(0, 10),
      jobRunId: ctx.jobRunId,
    });
  },
});

export const briefingBaseline = defineJob({
  name: "briefing.baseline",
  payload: z.object({ orgId: z.string().min(1) }),
  idempotencyKey: (p) => `baseline:${p.orgId}`,
  timeoutSeconds: 600,
  run: async (payload, ctx) => {
    // No watched entities yet (the wizard has no competitors step) — a dossier
    // now would be empty. context.enrich re-triggers this when the first
    // entity lands, so returning here does not strand the baseline.
    const watched = await scopedDb(payload.orgId, getDb()).select(orgEntities);
    if (!watched.some((w) => w.archivedAt === null)) return;

    const today = new Date().toISOString().slice(0, 10);
    const end = new Date(`${today}T00:00:00Z`).getTime() + DAY_MS;
    await generateBriefing({
      orgId: payload.orgId,
      kind: "baseline",
      windowStart: new Date(end - BASELINE_LOOKBACK_DAYS * DAY_MS),
      windowEnd: new Date(end),
      periodStart: today,
      periodEnd: today,
      jobRunId: ctx.jobRunId,
    });
  },
});

async function generateBriefing(args: {
  orgId: string;
  kind: "weekly" | "baseline";
  windowStart: Date;
  windowEnd: Date;
  periodStart: string;
  periodEnd: string;
  jobRunId: string;
}): Promise<void> {
  const db = getDb();
  const scoped = scopedDb(args.orgId, db);
  const context = await currentContext(scoped);
  if (!context) return;

  // One briefing per org/kind/period — the unique index makes retries no-ops
  // past this point; an existing undelivered row resumes at delivery fan-out.
  // The baseline is once per org EVER, whatever day it ran: context.enrich
  // re-fires it on every context edit and only entity count gates it.
  const [existing] = await scoped.select(
    briefings,
    args.kind === "baseline"
      ? eq(briefings.kind, "baseline")
      : and(eq(briefings.kind, args.kind), eq(briefings.periodStart, args.periodStart)),
  );
  if (existing) {
    if (existing.status === "ready") {
      await fanOutDeliveries(scoped, context, existing.id, args.orgId);
    }
    return;
  }

  const entityNames = await entityNameMap(db);
  const gathered = await gatherSignals(db, scoped, entityNames, args.windowStart, args.windowEnd);
  const periodLabel =
    args.kind === "baseline"
      ? `Baseline — ${args.periodStart}`
      : `Week of ${args.periodStart}`;

  const { ast, drops } = await orchestrateBriefing(
    {
      kind: args.kind,
      orgName: context.payload.company.name,
      periodLabel,
      webUrl: process.env.WEB_URL ?? process.env.NEXT_PUBLIC_SERVER_URL ?? "",
      modules: activeModuleKeys(await scoped.select(orgModules)),
      signals: gathered,
      entityMemory: await entityMemory(db, scoped, entityNames, args.windowStart),
      battlecardChanges: await battlecardChanges(scoped, entityNames, args.windowStart, args.windowEnd),
      coverage: await orgCoverage(db, scoped, entityNames),
      priorities: context.payload.priorities
        .filter((p) => p.status === "active")
        .map((p) => ({ id: p.id, text: p.text })),
      segments: context.payload.segments.map((s) => s.name),
      openActions: await openActionLines(scoped),
      insights: await orchestrateInsights(db, scoped, entityNames, args.windowStart, args.windowEnd),
      missionUpdates: await missionUpdateLines(scoped),
    },
    taskSynth({
      orgId: args.orgId,
      jobRunId: args.jobRunId,
      periodLabel,
      orgContext: {
        positioningStatement: context.payload.positioning.statement,
        priorities: context.payload.priorities.map((p) => ({ id: p.id, text: p.text })),
        segments: context.payload.segments.map((s) => s.name),
      },
    }),
  );

  // QA-gate drops are reviewed, not ignored (briefing doc #5) — loud in logs;
  // repeated drops surface through dead-letter review when sections fail hard.
  for (const drop of drops) {
    console.error(`briefing ${args.kind} ${args.orgId} dropped section ${drop.key}:`, drop.issues);
  }

  const [row] = await scoped
    .insert(briefings, {
      kind: args.kind,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      status: "ready",
      sections: ast,
      contextVersion: context.version,
    })
    .onConflictDoNothing({
      target: [briefings.workosOrgId, briefings.kind, briefings.periodStart],
    })
    .returning({ id: briefings.id });
  if (!row) return;

  await fanOutDeliveries(scoped, context, row.id, args.orgId);
}

async function fanOutDeliveries(
  scoped: ReturnType<typeof scopedDb>,
  context: ContextVersion,
  briefingId: string,
  orgId: string,
): Promise<void> {
  const cfg = context.payload.delivery.channels;
  const channels: Array<"email" | "slack"> = [];
  if (cfg.email.length > 0) channels.push("email");
  if (cfg.slackWebhook) channels.push("slack");

  const existing = await scoped.select(
    deliveries,
    and(eq(deliveries.targetType, "briefing"), eq(deliveries.targetId, briefingId)),
  );
  for (const channel of channels) {
    if (existing.some((d) => d.channel === channel)) continue;
    const [row] = await scoped
      .insert(deliveries, {
        channel,
        targetType: "briefing",
        targetId: briefingId,
        status: "queued",
      })
      .returning({ id: deliveries.id });
    await triggerTask(
      "delivery.send",
      { orgId, deliveryId: row!.id },
      { idempotencyKey: `deliver:${row!.id}`, orgId },
    );
  }
}

// ── gather helpers ───────────────────────────────────────────────────────

async function entityNameMap(db: Database): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: entities.id, name: entities.canonicalName })
    .from(entities);
  return new Map(rows.map((r) => [r.id, r.name]));
}

async function gatherSignals(
  db: Database,
  scoped: ReturnType<typeof scopedDb>,
  entityNames: Map<string, string>,
  from: Date,
  to: Date,
): Promise<GatheredSignal[]> {
  const rows = await db
    .select({
      signal: signals,
      sourceUrl: sources.url,
      extractedFacts: changes.extractedFacts,
    })
    .from(signals)
    .innerJoin(changes, eq(signals.changeId, changes.id))
    .innerJoin(sources, eq(changes.sourceId, sources.id))
    .where(
      and(scoped.scope(signals), gte(signals.createdAt, from), lt(signals.createdAt, to)),
    );
  return rows.map(({ signal: s, sourceUrl, extractedFacts }) => ({
    id: s.id,
    entityId: s.entityId,
    entity: entityNames.get(s.entityId) ?? "Unknown",
    category: s.category,
    severity: s.severity,
    // Invert scoring's groundingFactor (0.5 + grounding/200) back to raw
    // 0–100; 0.75 is the midpoint default when scores are absent.
    grounding:
      (((s.scores as { factors?: { groundingFactor?: number } } | null)?.factors
        ?.groundingFactor ?? 0.75) -
        0.5) *
      200,
    finding: s.finding,
    whyItMatters: s.whyItMatters,
    evidenceIds: s.evidenceIds,
    sourceUrl,
    date: s.createdAt.toISOString().slice(0, 10),
    extractedFacts,
    priorityAttachments: s.priorityAttachments as GatheredSignal["priorityAttachments"],
  }));
}

/** "Third pricing move this quarter" memory: pre-window signals per entity. */
async function entityMemory(
  db: Database,
  scoped: ReturnType<typeof scopedDb>,
  entityNames: Map<string, string>,
  before: Date,
): Promise<Array<{ entity: string; note: string }>> {
  const rows = await db
    .select({ entityId: signals.entityId, finding: signals.finding, createdAt: signals.createdAt })
    .from(signals)
    .where(
      and(
        scoped.scope(signals),
        gte(signals.createdAt, new Date(before.getTime() - MEMORY_LOOKBACK_DAYS * DAY_MS)),
        lt(signals.createdAt, before),
      ),
    );
  const perEntity = new Map<string, number>();
  const memory: Array<{ entity: string; note: string }> = [];
  for (const r of rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
    const used = perEntity.get(r.entityId) ?? 0;
    if (used >= MEMORY_PER_ENTITY) continue;
    perEntity.set(r.entityId, used + 1);
    memory.push({
      entity: entityNames.get(r.entityId) ?? "Unknown",
      note: `${r.finding} (${r.createdAt.toISOString().slice(0, 10)})`,
    });
  }
  return memory;
}

async function battlecardChanges(
  scoped: ReturnType<typeof scopedDb>,
  entityNames: Map<string, string>,
  from: Date,
  to: Date,
): Promise<Array<{ entity: string; sectionKey: string; note: string; at: string }>> {
  const cards = await scoped.select(battlecards);
  const out: Array<{ entity: string; sectionKey: string; note: string; at: string }> = [];
  for (const card of cards) {
    const log = (card.changelog ?? []) as Array<{ at: string; section: string; action: string }>;
    for (const entry of log) {
      const at = new Date(entry.at);
      if (at < from || at >= to) continue;
      out.push({
        entity: entityNames.get(card.entityId) ?? "Unknown",
        sectionKey: entry.section,
        note: entry.action === "flagged_stale" ? "flagged stale (edited section)" : entry.action,
        at: entry.at.slice(0, 10),
      });
    }
  }
  return out;
}

async function openActionLines(
  scoped: ReturnType<typeof scopedDb>,
): Promise<Array<{ description: string; ownerName: string | null; ageDays: number }>> {
  const open = await scoped.select(actions, eq(actions.status, "open"));
  const now = Date.now();
  return open.map((a) => ({
    description: a.description,
    ownerName: null,
    ageDays: Math.max(0, Math.floor((now - a.createdAt.getTime()) / DAY_MS)),
  }));
}

async function orchestrateInsights(
  db: Database,
  scoped: ReturnType<typeof scopedDb>,
  entityNames: Map<string, string>,
  from: Date,
  to: Date,
) {
  const rows = await scoped.select(
    insights,
    and(gte(insights.createdAt, from), lt(insights.createdAt, to)),
  );
  if (rows.length === 0) return [];
  const evidenceIds = [...new Set(rows.flatMap((i) => i.evidenceIds))];
  const evidenceRows = evidenceIds.length
    ? await db
        .select({ id: evidence.id, sourceUrl: evidence.sourceUrl, fetchedAt: evidence.fetchedAt })
        .from(evidence)
        .where(inArray(evidence.id, evidenceIds))
    : [];
  const evidenceById = new Map(evidenceRows.map((e) => [e.id, e]));
  return rows.map((i) => ({
    id: i.id,
    entity: entityNames.get(i.entityId) ?? "Unknown",
    kind: i.kind,
    pattern: i.pattern,
    analysis: i.analysis,
    forwardLook: i.forwardLook,
    confidence: i.confidence,
    confidenceNotes: i.confidenceNotes,
    trackRecord: null,
    corroboration: null,
    signalIds: i.signalIds,
    evidence: i.evidenceIds.map((id) => ({
      evidenceId: id,
      sourceUrl: evidenceById.get(id)?.sourceUrl ?? null,
      fetchedAt: evidenceById.get(id)?.fetchedAt.toISOString().slice(0, 10) ?? null,
    })),
  }));
}

async function missionUpdateLines(scoped: ReturnType<typeof scopedDb>) {
  const active = await scoped.select(missions, eq(missions.status, "active"));
  if (active.length === 0) return [];
  const openByMission = new Map<string, number>();
  const open = await scoped.select(
    actions,
    and(eq(actions.sourceType, "mission"), eq(actions.status, "open")),
  );
  for (const a of open) {
    openByMission.set(a.sourceId, (openByMission.get(a.sourceId) ?? 0) + 1);
  }
  return active.map((m) => ({
    missionId: m.id,
    goal: m.goal,
    // brief.situation is stored as { text, refs } — parse, never cast.
    situation: parseMissionBrief(m.brief)?.situation.text ?? null,
    openActions: openByMission.get(m.id) ?? 0,
  }));
}

async function orgCoverage(
  db: Database,
  scoped: ReturnType<typeof scopedDb>,
  entityNames: Map<string, string>,
): Promise<Array<{ entity: string; sourceCount: number }>> {
  const watched = await scoped.select(orgEntities);
  const active = watched.filter((w) => w.archivedAt === null);
  if (active.length === 0) return [];
  const sourceRows = await db
    .select({ entityId: sources.entityId })
    .from(sources)
    .where(inArray(sources.entityId, active.map((w) => w.entityId)));
  const counts = new Map<string, number>();
  for (const r of sourceRows) counts.set(r.entityId, (counts.get(r.entityId) ?? 0) + 1);
  return active.map((w) => ({
    entity: entityNames.get(w.entityId) ?? "Unknown",
    sourceCount: counts.get(w.entityId) ?? 0,
  }));
}
