import { and, eq, gte, lt, sql } from "drizzle-orm";

import { getDb, type Database } from "./client";
import { actions, briefings, outcomes } from "./schema";

/**
 * Outcome-tracking metrics (Phase 2.2, PRD): action rate (% of briefings
 * producing ≥1 tracked action, target > 30%), actions per org per month,
 * outcome-attached %. Admin-dashboard reads next to cost/margin — a
 * deliberate cross-org ops read (env-gated surface), same standing as
 * cost-rollups; per-org app paths still go through scopedDb.
 */

export interface OrgActionMetrics {
  workosOrgId: string;
  /** Actions created in the window. */
  actionsCreated: number;
  openActions: number;
  doneActions: number;
  /** % of done actions in the window carrying ≥1 outcomes row. */
  outcomeAttachedPct: number;
  /** % of delivered briefings in the window with ≥1 action created from them. */
  briefingActionRatePct: number;
}

export async function orgActionMetrics(
  from: Date,
  to: Date,
  db: Database = getDb(),
): Promise<OrgActionMetrics[]> {
  const actionRows = await db
    .select({
      org: actions.workosOrgId,
      created: sql<string>`count(distinct ${actions.id})`,
      open: sql<string>`count(distinct ${actions.id}) filter (where ${actions.status} = 'open')`,
      done: sql<string>`count(distinct ${actions.id}) filter (where ${actions.status} = 'done')`,
      doneWithOutcome: sql<string>`count(distinct ${actions.id}) filter (where ${actions.status} = 'done' and ${outcomes.id} is not null)`,
    })
    .from(actions)
    .leftJoin(outcomes, eq(outcomes.actionId, actions.id))
    .where(and(gte(actions.createdAt, from), lt(actions.createdAt, to)))
    .groupBy(actions.workosOrgId);

  // "Produced an action" is mechanical: the action was created FROM the
  // briefing (source_type = briefing) — not inferred from timing.
  const briefingRows = await db
    .select({
      org: briefings.workosOrgId,
      delivered: sql<string>`count(*)`,
      withAction: sql<string>`count(*) filter (where exists (
        select 1 from ${actions} a
        where a.workos_org_id = ${briefings.workosOrgId}
          and a.source_type = 'briefing'
          and a.source_id = ${briefings.id}
      ))`,
    })
    .from(briefings)
    .where(
      and(
        eq(briefings.status, "delivered"),
        gte(briefings.createdAt, from),
        lt(briefings.createdAt, to),
      ),
    )
    .groupBy(briefings.workosOrgId);

  const rate = new Map(
    briefingRows.map((r) => [
      r.org,
      Number(r.delivered) > 0
        ? Math.round((100 * Number(r.withAction)) / Number(r.delivered))
        : 0,
    ]),
  );

  const orgs = new Set([
    ...actionRows.map((r) => r.org),
    ...briefingRows.map((r) => r.org),
  ]);
  const byOrg = new Map(actionRows.map((r) => [r.org, r]));

  return [...orgs].map((org) => {
    const a = byOrg.get(org);
    const done = Number(a?.done ?? 0);
    return {
      workosOrgId: org,
      actionsCreated: Number(a?.created ?? 0),
      openActions: Number(a?.open ?? 0),
      doneActions: done,
      outcomeAttachedPct:
        done > 0
          ? Math.round((100 * Number(a?.doneWithOutcome ?? 0)) / done)
          : 0,
      briefingActionRatePct: rate.get(org) ?? 0,
    };
  });
}
