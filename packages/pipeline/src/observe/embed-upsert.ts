import { eq } from "drizzle-orm";
import { z } from "zod";

import { embed } from "@ayeastra/ai";
import { changes, getDb, signals } from "@ayeastra/db";
import { defineJob } from "@ayeastra/jobs";

/**
 * embed.upsert (ask doc) — `embed` queue consumer: change/signal summaries
 * into the pgvector columns that power novelty dedup and Ask retrieval.
 * Trigger-side jobs publish here over the Queues HTTP API (the reverse seam).
 */

export const embedUpsert = defineJob({
  name: "embed.upsert",
  payload: z.object({
    target: z.enum(["change", "signal"]),
    id: z.uuid(),
  }),
  idempotencyKey: (p) => `embed:${p.target}:${p.id}`,
  run: async (payload, ctx) => {
    const db = getDb();

    if (payload.target === "change") {
      const [row] = await db
        .select({ summary: changes.summary, embedding: changes.embedding })
        .from(changes)
        .where(eq(changes.id, payload.id));
      if (!row?.summary || row.embedding) return; // nothing to embed / already done
      const [vector] = await embed([row.summary], { jobRunId: ctx.jobRunId });
      await db.update(changes).set({ embedding: vector }).where(eq(changes.id, payload.id));
      return;
    }

    const [row] = await db
      .select({
        finding: signals.finding,
        whyItMatters: signals.whyItMatters,
        embedding: signals.embedding,
        orgId: signals.workosOrgId,
      })
      .from(signals)
      .where(eq(signals.id, payload.id));
    if (!row || row.embedding) return;
    const [vector] = await embed([`${row.finding}\n${row.whyItMatters}`], {
      orgId: row.orgId,
      jobRunId: ctx.jobRunId,
    });
    await db.update(signals).set({ embedding: vector }).where(eq(signals.id, payload.id));
  },
});
