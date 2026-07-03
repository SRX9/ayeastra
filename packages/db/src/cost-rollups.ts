import { and, gte, isNotNull, lt, sql } from "drizzle-orm";

import { getDb, type Database } from "./client";
import { costEvents } from "./schema";

/**
 * Cost telemetry rollups (observability doc): "What does org X cost us?"
 * and "most expensive source?" are dashboard READS, not investigations.
 * These power the nightly rollup job and the /admin margin dashboard.
 */

const day = sql<string>`date_trunc('day', ${costEvents.at})::date::text`;
const totalUsd = sql<string>`sum(${costEvents.costUsd})`;

export interface RollupRow {
  day: string;
  key: string | null;
  costUsd: number;
}

function toRows(rows: { day: string; key: string | null; costUsd: string }[]) {
  return rows.map((r) => ({ ...r, costUsd: Number(r.costUsd) }));
}

async function rollup(
  keyColumn: unknown,
  from: Date,
  to: Date,
  db: Database,
): Promise<RollupRow[]> {
  const key = sql<string | null>`${keyColumn}`;
  const rows = await db
    .select({ day, key, costUsd: totalUsd })
    .from(costEvents)
    .where(and(gte(costEvents.at, from), lt(costEvents.at, to)))
    .groupBy(day, key)
    .orderBy(day, sql`sum(${costEvents.costUsd}) desc`);
  return toRows(rows);
}

export const costPerOrgDay = (from: Date, to: Date, db = getDb()) =>
  rollup(costEvents.workosOrgId, from, to, db);

export const costPerSourceDay = (from: Date, to: Date, db = getDb()) =>
  rollup(costEvents.sourceId, from, to, db);

export const costPerTaskDay = (from: Date, to: Date, db = getDb()) =>
  rollup(costEvents.taskName, from, to, db);

/**
 * Anomaly rule (observability doc): org/day > 3× its trailing 14-day mean.
 * Run against "yesterday" by the nightly job; returns offending orgs.
 */
export const ORG_ANOMALY_MULTIPLIER = 3;

export interface OrgAnomaly {
  workosOrgId: string;
  dayUsd: number;
  trailingMeanUsd: number;
}

export async function orgCostAnomalies(
  dayStart: Date,
  db: Database = getDb(),
): Promise<OrgAnomaly[]> {
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const trailingStart = new Date(dayStart.getTime() - 14 * 24 * 60 * 60 * 1000);

  const orgDay = sql<string>`date_trunc('day', ${costEvents.at})`;
  const perOrgDay = db
    .select({
      org: costEvents.workosOrgId,
      d: orgDay.as("d"),
      usd: totalUsd.as("usd"),
    })
    .from(costEvents)
    .where(
      and(
        isNotNull(costEvents.workosOrgId),
        gte(costEvents.at, trailingStart),
        lt(costEvents.at, dayEnd),
      ),
    )
    .groupBy(costEvents.workosOrgId, orgDay)
    .as("per_org_day");

  const rows = await db
    .select({
      workosOrgId: sql<string>`${perOrgDay.org}`,
      dayUsd: sql<string>`sum(${perOrgDay.usd}) filter (where ${perOrgDay.d} >= ${dayStart} and ${perOrgDay.d} < ${dayEnd})`,
      // Divide by the full 14-day window, not just days that had events —
      // avg() over sparse rows treats a $50 burst on 1 of 14 days as a $50/day
      // baseline and hides exactly the bursty overspend this alert exists for.
      trailingMeanUsd: sql<string>`coalesce(sum(${perOrgDay.usd}) filter (where ${perOrgDay.d} < ${dayStart}), 0) / 14.0`,
    })
    .from(perOrgDay)
    .groupBy(perOrgDay.org);

  return rows
    .map((r) => ({
      workosOrgId: r.workosOrgId,
      dayUsd: Number(r.dayUsd ?? 0),
      trailingMeanUsd: Number(r.trailingMeanUsd),
    }))
    .filter(
      (r) =>
        r.trailingMeanUsd > 0 &&
        r.dayUsd > ORG_ANOMALY_MULTIPLIER * r.trailingMeanUsd,
    );
}
