import { and, desc, eq, inArray } from "drizzle-orm";

import {
  costEvents,
  getDb,
  monitorState,
  snapshots,
  sources,
  type Database,
} from "@ayeastra/db";
import { contentHash, normalizeMarkdown, NORMALIZER_VERSION } from "@ayeastra/diff";

import { snapshotKeys, type BlobStore } from "./blob-store";
import type { FetchProvider } from "./fetch-provider";
import { nextEwma, nextInterval, statusForFailures } from "./scheduling";

/**
 * source.fetch core (collection doc): scrape → R2 → snapshots row →
 * monitor_state update → cost event. Platform-neutral; the CF queue
 * consumer supplies provider + blob store. One fetch serves every org.
 */

/** $/Firecrawl credit; standard plan ≈ $83/100k. Override per deploy. */
const COST_PER_CREDIT = Number(process.env.FIRECRAWL_COST_PER_CREDIT ?? 0.00083);

export interface CaptureResult {
  snapshotId: string;
  contentHash: string;
  /** Hash gate verdict vs. previous snapshot — drives change.detect. */
  changed: boolean;
  previousSnapshotId: string | null;
  previousMdKey: string | null;
}

export async function captureSnapshot(args: {
  sourceId: string;
  provider: FetchProvider;
  blobs: BlobStore;
  jobRunId?: string;
  db?: Database;
}): Promise<CaptureResult> {
  const db = args.db ?? getDb();
  const [source] = await db
    .select()
    .from(sources)
    .where(eq(sources.id, args.sourceId));
  if (!source) throw new Error(`source ${args.sourceId} not found`);

  const fetchedAt = new Date();
  let result;
  try {
    result = await args.provider.scrape(source.url, {
      screenshot: source.kind === "pricing",
    });
  } catch (err) {
    await recordFailure(db, args.sourceId);
    throw err;
  }

  const normalized = normalizeMarkdown(result.markdown, source.kind);
  const hash = contentHash(normalized);
  const keys = snapshotKeys(args.sourceId, fetchedAt, hash);

  const [previous] = await db
    .select({
      id: snapshots.id,
      contentHash: snapshots.contentHash,
      r2MdKey: snapshots.r2MdKey,
    })
    .from(snapshots)
    .where(eq(snapshots.sourceId, args.sourceId))
    .orderBy(desc(snapshots.fetchedAt))
    .limit(1);

  await args.blobs.put(keys.html, result.html, "text/html");
  await args.blobs.put(keys.md, result.markdown, "text/markdown");
  if (result.screenshot) {
    await args.blobs.put(keys.png, result.screenshot, "image/png");
  }

  const [row] = await db
    .insert(snapshots)
    .values({
      sourceId: args.sourceId,
      fetchedAt,
      contentHash: hash,
      r2HtmlKey: keys.html,
      r2MdKey: keys.md,
      r2ScreenshotKey: result.screenshot ? keys.png : null,
      httpStatus: result.httpStatus,
      fetchMeta: {
        normalizerVersion: NORMALIZER_VERSION,
        creditsUsed: result.creditsUsed,
      },
    })
    .returning({ id: snapshots.id });

  const changed = previous ? previous.contentHash !== hash : false;

  // Spend gate #2 (observability doc): fetch cost, tagged sourceId, org null.
  await db.insert(costEvents).values({
    vendor: "firecrawl",
    taskName: "source.fetch",
    units: result.creditsUsed,
    costUsd: (result.creditsUsed * COST_PER_CREDIT).toFixed(6),
    sourceId: args.sourceId,
    jobRunId: args.jobRunId,
    meta: { estimate: true },
  });

  await recordSuccess(db, args.sourceId, source.kind, changed, fetchedAt);

  return {
    snapshotId: row!.id,
    contentHash: hash,
    changed,
    previousSnapshotId: previous?.id ?? null,
    previousMdKey: previous?.r2MdKey ?? null,
  };
}

async function recordSuccess(
  db: Database,
  sourceId: string,
  kind: string,
  changed: boolean,
  at: Date,
): Promise<void> {
  const [state] = await db
    .select()
    .from(monitorState)
    .where(eq(monitorState.sourceId, sourceId));
  const current = state?.checkIntervalMinutes ?? 1440;
  const interval = nextInterval({
    current,
    kind,
    materialChange: changed,
    pinned: state?.pinnedIntervalMinutes,
  });
  const values = {
    checkIntervalMinutes: interval,
    nextCheckAt: new Date(at.getTime() + interval * 60_000),
    changeRateEwma: nextEwma(state?.changeRateEwma ?? 0, changed),
    consecutiveFailures: 0,
    ...(changed ? { lastChangeAt: at } : {}),
  };
  await db
    .insert(monitorState)
    .values({ sourceId, ...values })
    .onConflictDoUpdate({ target: monitorState.sourceId, set: values });
  // A successful capture heals BOTH failure states — a source that reached
  // "broken" and then recovers must not display broken forever.
  await db
    .update(sources)
    .set({ status: "ok" })
    .where(
      and(eq(sources.id, sourceId), inArray(sources.status, ["degraded", "broken"])),
    );
}

async function recordFailure(db: Database, sourceId: string): Promise<void> {
  const [state] = await db
    .select()
    .from(monitorState)
    .where(eq(monitorState.sourceId, sourceId));
  const failures = (state?.consecutiveFailures ?? 0) + 1;
  const status = statusForFailures(failures);
  // The retry-in-1h backoff must apply on the conflict path too — an
  // already-monitored source whose nextCheckAt stays past-due would be
  // re-fetched on every scheduler tick, burning fetch credits in a loop.
  const nextCheckAt = new Date(Date.now() + 60 * 60_000);
  await db
    .insert(monitorState)
    .values({
      sourceId,
      checkIntervalMinutes: state?.checkIntervalMinutes ?? 1440,
      nextCheckAt,
      consecutiveFailures: failures,
    })
    .onConflictDoUpdate({
      target: monitorState.sourceId,
      set: { consecutiveFailures: failures, nextCheckAt },
    });
  if (status !== "ok") {
    // Coverage transparency: degraded/broken is visible, never silent.
    await db.update(sources).set({ status }).where(eq(sources.id, sourceId));
  }
}
