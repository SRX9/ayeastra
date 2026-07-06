import { and, eq, gte } from "drizzle-orm";
import { z } from "zod";

import { captureSnapshot } from "@ayeastra/collection";
import { getDb, snapshots } from "@ayeastra/db";
import { defineJob } from "@ayeastra/jobs";

import { observePorts } from "./ports";

/**
 * source.fetch (collection doc) — `fetch` queue consumer: Firecrawl → R2
 * snapshot + snapshots row (captureSnapshot owns storage, monitor_state
 * adaptation, the failure ladder, and cost emission). A changed hash fans
 * out change.detect. The per-domain politeness semaphore wraps this at the
 * host (the DO lives in the worker; queue replays are caught by the
 * bucket guard below, so no Redis lock is needed).
 */

export const sourceFetch = defineJob({
  name: "source.fetch",
  payload: z.object({
    sourceId: z.uuid(),
    bucket: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}$/),
  }),
  idempotencyKey: (p) => `fetch:${p.sourceId}:${p.bucket}`,
  run: async (payload, ctx) => {
    const db = getDb();

    // Replay guard (convention #2): a snapshot already captured in this
    // bucket makes the duplicate delivery a no-op.
    const bucketStart = new Date(`${payload.bucket}:00:00Z`);
    const [already] = await db
      .select({ id: snapshots.id })
      .from(snapshots)
      .where(
        and(
          eq(snapshots.sourceId, payload.sourceId),
          gte(snapshots.fetchedAt, bucketStart),
        ),
      )
      .limit(1);
    if (already) return;

    const ports = observePorts();
    const result = await captureSnapshot({
      sourceId: payload.sourceId,
      provider: ports.provider,
      blobs: ports.blobs,
      jobRunId: ctx.jobRunId,
      db,
    });

    if (result.changed && result.previousSnapshotId) {
      await ports.enqueueDetect({
        sourceId: payload.sourceId,
        beforeSnapshotId: result.previousSnapshotId,
        afterSnapshotId: result.snapshotId,
      });
    }
  },
});
