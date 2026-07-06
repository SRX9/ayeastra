import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { changes, getDb, orgEntities, sources } from "@ayeastra/db";
import { defineJob } from "@ayeastra/jobs";

import { triggerTask } from "../seam";

/**
 * change.analyze (scoring doc) — the REST seam target for material changes:
 * fan out signal.ground per watching org. One org-agnostic fact becomes N
 * org-specific assessments; grounding itself happens per org downstream.
 */

export const changeAnalyze = defineJob({
  name: "change.analyze",
  payload: z.object({ changeId: z.uuid() }),
  idempotencyKey: (p) => `analyze:${p.changeId}`,
  run: async (payload) => {
    const db = getDb();
    const [row] = await db
      .select({ materiality: changes.materiality, entityId: sources.entityId })
      .from(changes)
      .innerJoin(sources, eq(changes.sourceId, sources.id))
      .where(eq(changes.id, payload.changeId));
    if (!row || row.materiality !== "material") return;

    const watchers = await db
      .select({ orgId: orgEntities.workosOrgId })
      .from(orgEntities)
      .where(and(eq(orgEntities.entityId, row.entityId), isNull(orgEntities.archivedAt)));

    for (const { orgId } of watchers) {
      await triggerTask(
        "signal.ground",
        { orgId, changeId: payload.changeId },
        { idempotencyKey: `ground:${payload.changeId}:${orgId}`, orgId },
      );
    }
  },
});
