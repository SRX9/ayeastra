import { and, eq, gte, lt, sql } from "drizzle-orm";

import { getDb, type Database } from "./client";
import { feedback } from "./schema";

/**
 * Fusion-insight feedback rate (Phase 3.1 acceptance: > 70% useful on
 * connected-intelligence blocks — prominence demands a higher bar). Same
 * standing as action-metrics/cost-rollups: a deliberate cross-org ops read
 * for the admin dashboard; per-org app paths go through scopedDb.
 */

export interface InsightFeedbackStats {
  workosOrgId: string;
  rated: number;
  useful: number;
  usefulPct: number;
}

export async function insightFeedbackStats(
  from: Date,
  to: Date,
  db: Database = getDb(),
): Promise<InsightFeedbackStats[]> {
  const rows = await db
    .select({
      org: feedback.workosOrgId,
      rated: sql<string>`count(*)`,
      useful: sql<string>`count(*) filter (where ${feedback.verdict} = 'useful')`,
    })
    .from(feedback)
    .where(
      and(
        eq(feedback.targetType, "insight"),
        gte(feedback.createdAt, from),
        lt(feedback.createdAt, to),
      ),
    )
    .groupBy(feedback.workosOrgId);

  return rows.map((r) => {
    const rated = Number(r.rated);
    const useful = Number(r.useful);
    return {
      workosOrgId: r.org,
      rated,
      useful,
      usefulPct: rated > 0 ? Math.round((100 * useful) / rated) : 0,
    };
  });
}
