import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { z } from "zod";

import {
  briefSection,
  buildFactSheet,
  execSummary,
  missionBrief,
  missionRetro,
} from "@ayeastra/ai";
import type { GatheredSignal, Synth } from "@ayeastra/briefing";
import { currentContext } from "@ayeastra/core";
import {
  actions,
  briefings,
  entities,
  feedback,
  getDb,
  missions,
  orgEntities,
  outcomes,
  patterns,
  scopedDb,
  signals,
  sources,
  type Database,
} from "@ayeastra/db";
import type { PatternRow } from "@ayeastra/fusion";
import { defineJob } from "@ayeastra/jobs";

import { assembleBoard } from "./board";
import { missionRelevant, parseWatchSpec } from "./missions";

/**
 * Workflow-layer jobs (3.2), the package's impure edge. Trigger.dev wiring
 * rides @ayeastra/jobs adapters when the trigger app lands; the math and
 * assembly live in the pure modules where the tests are.
 *
 *  mission.brief    weekly per active mission (and on-demand after create)
 *  mission.retro    once, when a mission closes — institutional memory
 *  board.assemble   quarterly per org — the Board Mode artifact
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MISSION_FEED_DAYS = 30;
const MISSION_FACT_BUDGET = 10;
const RETRO_FACT_BUDGET = 12;

interface MissionSignalRow {
  id: string;
  entityId: string;
  category: string;
  severity: "critical" | "high" | "notable" | "info";
  finding: string;
  createdAt: Date;
  evidenceIds: string[];
  priorityAttachments: unknown;
}

async function missionFeed(
  scoped: ReturnType<typeof scopedDb>,
  mission: {
    entityIds: string[];
    watchSpec: unknown;
    priorityId: string | null;
  },
  from: Date,
): Promise<MissionSignalRow[]> {
  const rows = await scoped.select(signals, gte(signals.createdAt, from));
  const lens = {
    entityIds: mission.entityIds,
    watchSpec: parseWatchSpec(mission.watchSpec),
    priorityId: mission.priorityId,
  };
  return rows.filter((s) => missionRelevant(lens, s));
}

const severityRank = { critical: 3, high: 2, notable: 1, info: 0 } as const;

function topFacts(
  rows: MissionSignalRow[],
  budget: number,
  entityNames: Map<string, string>,
) {
  // Filter BEFORE slicing: evidence-less signals must not consume budget
  // slots and push citable signals below the cut.
  return rows
    .filter((s) => s.evidenceIds.length > 0)
    .sort(
      (a, b) =>
        severityRank[b.severity] - severityRank[a.severity] ||
        b.createdAt.getTime() - a.createdAt.getTime(),
    )
    .slice(0, budget)
    .map((s) => ({
      text: `${s.finding} (${s.createdAt.toISOString().slice(0, 10)})`,
      evidenceId: s.evidenceIds[0]!,
      // Canonical name, never the UUID — this string lands in the prompt and
      // the model uses it as a development heading.
      entity: entityNames.get(s.entityId) ?? "Unknown",
      date: s.createdAt.toISOString().slice(0, 10),
    }));
}

export const missionBriefJob = defineJob({
  name: "mission.brief",
  payload: z.object({
    orgId: z.string().min(1),
    missionId: z.uuid(),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  idempotencyKey: (p) => `mission.brief:${p.missionId}:${p.day}`,
  run: async (payload, ctx) => {
    const scoped = scopedDb(payload.orgId);
    const [mission] = await scoped.select(missions, eq(missions.id, payload.missionId));
    if (!mission || mission.status !== "active") return;
    const spec = parseWatchSpec(mission.watchSpec);

    const feed = await missionFeed(
      scoped,
      mission,
      new Date(Date.now() - MISSION_FEED_DAYS * DAY_MS),
    );
    const items = topFacts(feed, MISSION_FACT_BUDGET, await entityNameMap(getDb()));
    if (items.length === 0) return; // nothing new — keep the previous brief

    const sheet = buildFactSheet(items);
    const openActions = await scoped.select(
      actions,
      and(
        eq(actions.sourceType, "mission"),
        eq(actions.sourceId, mission.id),
        eq(actions.status, "open"),
      ),
    );

    const out = await missionBrief.run(
      {
        goal: mission.goal,
        watchSpec: {
          lookFor: spec?.lookFor ?? [],
          leadingIndicators: spec?.leadingIndicators ?? [],
        },
        facts: sheet.facts.map((f, i) => ({
          ref: f.ref,
          text: f.text,
          entity: items[i]!.entity,
          date: items[i]!.date,
        })),
        openActions: openActions.map((a) => a.description),
      },
      { orgId: payload.orgId, jobRunId: ctx.jobRunId },
    );

    const citations = Object.fromEntries(
      sheet.facts.map((f) => [f.ref, { evidenceId: f.evidenceId, sourceUrl: null }]),
    );
    await scoped.update(
      missions,
      {
        brief: {
          v: 1,
          situation: out.situation,
          developments: out.developments,
          outlook: out.outlook,
          citations,
          updatedAt: new Date().toISOString(),
        },
      },
      eq(missions.id, mission.id),
    );
  },
});

export const missionRetroJob = defineJob({
  name: "mission.retro",
  payload: z.object({ orgId: z.string().min(1), missionId: z.uuid() }),
  idempotencyKey: (p) => `mission.retro:${p.missionId}`,
  run: async (payload, ctx) => {
    const scoped = scopedDb(payload.orgId);
    const [mission] = await scoped.select(missions, eq(missions.id, payload.missionId));
    if (!mission || mission.status !== "closed" || mission.retrospective) return;

    const feed = await missionFeed(scoped, mission, mission.createdAt);
    const items = topFacts(feed, RETRO_FACT_BUDGET, await entityNameMap(getDb()));
    const sheet = buildFactSheet(items);

    // Quiet mission: with zero citable facts the retro task cannot produce
    // valid output (its schema requires ≥1 ref and every ref must be in the
    // FactSheet) — write the "little materialized" retro directly instead of
    // burning model calls on a run that can only dead-letter.
    if (items.length === 0) {
      const spec = parseWatchSpec(mission.watchSpec);
      const closedAtQuiet = mission.closedAt ?? new Date();
      await scoped.update(
        missions,
        {
          retrospective: {
            v: 1,
            whatWeWatched: spec?.lookFor.join("; ") || mission.goal,
            whatHappened: {
              text: "Little materialized — no evidence-backed developments were recorded during this mission.",
              refs: [],
            },
            actionsAndOutcomes: "",
            lessons: [],
            citations: {},
            closedAt: closedAtQuiet.toISOString(),
          },
        },
        eq(missions.id, mission.id),
      );
      return;
    }

    const missionActions = await scoped.select(
      actions,
      and(eq(actions.sourceType, "mission"), eq(actions.sourceId, mission.id)),
    );
    const actionOutcomes = missionActions.length
      ? await scoped.select(
          outcomes,
          inArray(outcomes.actionId, missionActions.map((a) => a.id)),
        )
      : [];
    const outcomeByAction = new Map(actionOutcomes.map((o) => [o.actionId, o]));

    const closedAt = mission.closedAt ?? new Date();
    const out = await missionRetro.run(
      {
        goal: mission.goal,
        openedAt: mission.createdAt.toISOString().slice(0, 10),
        closedAt: closedAt.toISOString().slice(0, 10),
        facts: sheet.facts.map((f, i) => ({
          ref: f.ref,
          text: f.text,
          entity: items[i]!.entity,
          date: items[i]!.date,
        })),
        actions: missionActions.map((a) => ({
          description: a.description,
          status: a.status,
          outcome: outcomeByAction.get(a.id)?.result ?? null,
        })),
      },
      { orgId: payload.orgId, jobRunId: ctx.jobRunId },
    );

    await scoped.update(
      missions,
      {
        retrospective: {
          v: 1,
          whatWeWatched: out.whatWeWatched,
          whatHappened: out.whatHappened,
          actionsAndOutcomes: out.actionsAndOutcomes,
          lessons: out.lessons,
          citations: Object.fromEntries(
            sheet.facts.map((f) => [f.ref, { evidenceId: f.evidenceId, sourceUrl: null }]),
          ),
          closedAt: closedAt.toISOString(),
        },
      },
      eq(missions.id, mission.id),
    );
  },
});

/** The two AI tasks behind the briefing Synth interface. */
export function taskSynth(input: {
  orgId: string;
  jobRunId: string;
  periodLabel: string;
  orgContext: {
    positioningStatement: string;
    priorities: Array<{ id: string; text: string }>;
    segments: string[];
  };
}): Synth {
  return {
    async section(s) {
      const out = await briefSection.run(
        {
          sectionKey: s.sectionKey as never,
          periodLabel: input.periodLabel,
          orgContext: input.orgContext,
          facts: s.facts,
          entityMemory: s.entityMemory,
          qaNotes: s.qaNotes,
        },
        { orgId: input.orgId, jobRunId: input.jobRunId },
      );
      return { blocks: out.blocks };
    },
    async execSummary(s) {
      const out = await execSummary.run(
        { periodLabel: input.periodLabel, sections: s.sections },
        { orgId: input.orgId, jobRunId: input.jobRunId },
      );
      return { bullets: out.bullets };
    },
  };
}

export const boardAssembleJob = defineJob({
  name: "board.assemble",
  payload: z.object({
    orgId: z.string().min(1),
    /** e.g. "2026-Q2"; quarter start derives the window. */
    quarter: z.string().regex(/^\d{4}-Q[1-4]$/),
  }),
  idempotencyKey: (p) => `board.assemble:${p.orgId}:${p.quarter}`,
  run: async (payload, ctx) => {
    const db = getDb();
    const scoped = scopedDb(payload.orgId, db);
    const context = await currentContext(scoped);
    if (!context) return;

    const [yearStr, qStr] = payload.quarter.split("-Q") as [string, string];
    const year = Number(yearStr);
    const q = Number(qStr);
    const qStart = new Date(Date.UTC(year, (q - 1) * 3, 1));
    const qEnd = new Date(Date.UTC(year, q * 3, 1));
    const prevStart = new Date(Date.UTC(year, (q - 2) * 3, 1));

    const entityNames = await entityNameMap(db);
    const quarterSignals = await scoped.select(
      signals,
      and(gte(signals.createdAt, qStart), lt(signals.createdAt, qEnd)),
    );
    const lastQuarterSignals = await scoped.select(
      signals,
      and(gte(signals.createdAt, prevStart), lt(signals.createdAt, qStart)),
    );
    const gathered: GatheredSignal[] = quarterSignals.map((s) => ({
      id: s.id,
      entityId: s.entityId,
      entity: entityNames.get(s.entityId) ?? "Unknown",
      category: s.category,
      severity: s.severity,
      // Invert scoring's groundingFactor (0.5 + grounding/200, range 0.5–1.0)
      // back to the raw 0–100 grounding the briefing contract expects; the
      // 0.75 default is the midpoint (raw 50) when scores are absent.
      grounding:
        (((s.scores as { factors?: { groundingFactor?: number } } | null)?.factors
          ?.groundingFactor ?? 0.75) -
          0.5) *
        200,
      finding: s.finding,
      whyItMatters: s.whyItMatters,
      evidenceIds: s.evidenceIds,
      sourceUrl: null,
      date: s.createdAt.toISOString().slice(0, 10),
      extractedFacts: null,
      priorityAttachments: s.priorityAttachments as never,
    }));

    const orgActions = await scoped.select(
      actions,
      and(gte(actions.createdAt, qStart), lt(actions.createdAt, qEnd)),
    );
    const orgOutcomes = orgActions.length
      ? await scoped.select(
          outcomes,
          inArray(outcomes.actionId, orgActions.map((a) => a.id)),
        )
      : [];
    const usefulNotes = await scoped.select(
      feedback,
      and(
        eq(feedback.verdict, "useful"),
        gte(feedback.createdAt, qStart),
        lt(feedback.createdAt, qEnd),
      ),
    );

    const patternRows = (await db
      .select()
      .from(patterns)
      .where(eq(patterns.status, "validated"))) as unknown as PatternRow[];

    const coverage = await orgCoverage(db, scoped, entityNames);

    const activity = (rows: { entityId: string; category: string }[]) =>
      rows.map((s) => ({
        entity: entityNames.get(s.entityId) ?? "Unknown",
        category: s.category,
      }));

    const { ast } = await assembleBoard(
      {
        orgName: context.payload.company.name,
        periodLabel: payload.quarter.replace("-", " "),
        webUrl: "",
        signals: gathered,
        landscape: {
          thisQuarter: activity(quarterSignals),
          lastQuarter: activity(lastQuarterSignals),
        },
        recap: {
          quarterLabel: payload.quarter.replace("-", " "),
          actions: orgActions.map((a) => ({
            description: a.description,
            status: a.status,
            ownerName: null,
          })),
          outcomes: orgOutcomes.map((o) => ({ kpi: o.kpi })),
          wouldHaveMissed: usefulNotes.flatMap((f) => (f.note ? [f.note] : [])),
        },
        patterns: patternRows,
        coverage,
      },
      taskSynth({
        orgId: payload.orgId,
        jobRunId: ctx.jobRunId,
        periodLabel: payload.quarter.replace("-", " "),
        orgContext: {
          positioningStatement: context.payload.positioning.statement,
          priorities: context.payload.priorities.map((p) => ({ id: p.id, text: p.text })),
          segments: context.payload.segments.map((s) => s.name),
        },
      }),
    );

    await scoped
      .insert(briefings, {
        kind: "board",
        periodStart: qStart.toISOString().slice(0, 10),
        periodEnd: new Date(qEnd.getTime() - DAY_MS).toISOString().slice(0, 10),
        status: "ready",
        sections: ast,
        contextVersion: context.version,
      })
      .onConflictDoNothing({
        target: [briefings.workosOrgId, briefings.kind, briefings.periodStart],
      });
  },
});

async function entityNameMap(db: Database): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: entities.id, name: entities.canonicalName })
    .from(entities);
  return new Map(rows.map((r) => [r.id, r.name]));
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
