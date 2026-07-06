import { and, asc, eq, isNull, lte, ne, or, sql } from "drizzle-orm";
import { z } from "zod";

import { boundsFor } from "@ayeastra/collection";
import { getDb, monitorState, sources } from "@ayeastra/db";
import { defineJob, hourBucket } from "@ayeastra/jobs";

import { observePorts, type FetchQueueMessage } from "./ports";

/**
 * scheduler.tick (collection doc) — cron every 15 min: adaptive scheduling over
 * monitor_state; enqueue due sources onto the `fetch` queue. Sources without
 * a monitor_state row (fresh from discovery) bootstrap one here. nextCheckAt
 * is pushed forward at enqueue time so the next tick never double-enqueues a
 * slow fetch; the real interval is re-derived on fetch success/failure.
 */

/** Fan-out cap per tick — a backlog drains over successive ticks instead of
 * flooding the queue (and Firecrawl) in one burst. */
const MAX_PER_TICK = 500;

export const schedulerTick = defineJob({
  name: "scheduler.tick",
  payload: z.object({ tickAt: z.iso.datetime() }),
  idempotencyKey: (p) => `scheduler.tick:${p.tickAt.slice(0, 16)}`,
  run: async (payload) => {
    const db = getDb();
    const now = new Date(payload.tickAt);

    const due = await db
      .select({
        sourceId: sources.id,
        kind: sources.kind,
        interval: monitorState.checkIntervalMinutes,
        stateExists: sql<boolean>`${monitorState.sourceId} is not null`,
      })
      .from(sources)
      .leftJoin(monitorState, eq(monitorState.sourceId, sources.id))
      .where(
        and(
          ne(sources.status, "retired"),
          or(isNull(monitorState.sourceId), lte(monitorState.nextCheckAt, now)),
        ),
      )
      .orderBy(asc(monitorState.nextCheckAt))
      .limit(MAX_PER_TICK);
    if (due.length === 0) return;

    const bucket = hourBucket(now);
    const messages: FetchQueueMessage[] = [];
    for (const row of due) {
      const interval = row.interval ?? boundsFor(row.kind).floor;
      const nextCheckAt = new Date(now.getTime() + interval * 60_000);
      await db
        .insert(monitorState)
        .values({ sourceId: row.sourceId, checkIntervalMinutes: interval, nextCheckAt })
        .onConflictDoUpdate({
          target: monitorState.sourceId,
          set: { nextCheckAt },
        });
      messages.push({ sourceId: row.sourceId, bucket });
    }

    await observePorts().enqueueFetch(messages);
  },
});
