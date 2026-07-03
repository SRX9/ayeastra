import { afterAll, describe, expect, test } from "bun:test";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";

dotenv.config({ path: "../../apps/server/.env" });

import {
  costEvents,
  entities,
  getDb,
  monitorState,
  snapshots,
  sources,
} from "@ayeastra/db";

import { InMemoryBlobStore } from "./blob-store";
import type { FetchProvider } from "./fetch-provider";
import { captureSnapshot } from "./snapshot";

/**
 * source.fetch core against the real dev DB: shared-fetch snapshot rows,
 * hash-gate verdicts, adaptive monitor_state, cost emission, failure ladder.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

function fakeProvider(markdown: () => string): FetchProvider {
  return {
    async scrape() {
      return { html: `<html>${markdown()}</html>`, markdown: markdown(), httpStatus: 200, creditsUsed: 1 };
    },
  };
}

describe.skipIf(!hasDb)("captureSnapshot", () => {
  const db = getDb();
  const blobs = new InMemoryBlobStore();
  let entityId: string;
  let sourceId: string;

  test("setup: temp entity + source", async () => {
    const [e] = await db
      .insert(entities)
      .values({ type: "company", canonicalName: "__test_capture", domain: `test-${Date.now()}.invalid` })
      .returning();
    entityId = e!.id;
    const [s] = await db
      .insert(sources)
      .values({ entityId, url: `https://${e!.domain}/pricing`, kind: "pricing", discovery: "user" })
      .returning();
    sourceId = s!.id;
  });

  test("first capture: snapshot + blobs + cost event, changed=false", async () => {
    const r = await captureSnapshot({
      sourceId,
      provider: fakeProvider(() => "# Pricing\n\n| Pro | $499/mo |"),
      blobs,
      jobRunId: "test-run-1",
    });
    expect(r.changed).toBe(false);
    expect(r.previousSnapshotId).toBeNull();
    expect(blobs.blobs.size).toBeGreaterThanOrEqual(2); // html + md (fake provider: no screenshot)

    const costs = await db.select().from(costEvents).where(eq(costEvents.sourceId, sourceId));
    expect(costs).toHaveLength(1);
    expect(costs[0]!.vendor).toBe("firecrawl");

    const [state] = await db.select().from(monitorState).where(eq(monitorState.sourceId, sourceId));
    expect(state!.consecutiveFailures).toBe(0);
  });

  test("unchanged content passes the hash gate; interval decays", async () => {
    const before = (await db.select().from(monitorState).where(eq(monitorState.sourceId, sourceId)))[0]!;
    const r = await captureSnapshot({
      sourceId,
      provider: fakeProvider(() => "# Pricing\n\n| Pro | $499/mo |"),
      blobs,
    });
    expect(r.changed).toBe(false);
    const after = (await db.select().from(monitorState).where(eq(monitorState.sourceId, sourceId)))[0]!;
    expect(after.checkIntervalMinutes).toBeGreaterThan(before.checkIntervalMinutes);
  });

  test("changed content flags change; interval tightens; lastChangeAt set", async () => {
    const r = await captureSnapshot({
      sourceId,
      provider: fakeProvider(() => "# Pricing\n\n| Pro | $399/mo |"),
      blobs,
    });
    expect(r.changed).toBe(true);
    expect(r.previousSnapshotId).not.toBeNull();
    expect(r.previousMdKey).not.toBeNull();
    const [state] = await db.select().from(monitorState).where(eq(monitorState.sourceId, sourceId));
    expect(state!.lastChangeAt).not.toBeNull();
    expect(state!.changeRateEwma).toBeGreaterThan(0);
  });

  test("failures climb the ladder to degraded", async () => {
    const failing: FetchProvider = {
      async scrape() {
        throw new Error("HTTP 503");
      },
    };
    for (let i = 0; i < 3; i++) {
      await expect(captureSnapshot({ sourceId, provider: failing, blobs })).rejects.toThrow("503");
    }
    const [src] = await db.select().from(sources).where(eq(sources.id, sourceId));
    expect(src!.status).toBe("degraded");
    const [state] = await db.select().from(monitorState).where(eq(monitorState.sourceId, sourceId));
    expect(state!.consecutiveFailures).toBe(3);
  });

  afterAll(async () => {
    if (!hasDb || !sourceId) return;
    await db.delete(costEvents).where(eq(costEvents.sourceId, sourceId));
    await db.delete(monitorState).where(eq(monitorState.sourceId, sourceId));
    await db.delete(snapshots).where(eq(snapshots.sourceId, sourceId));
    await db.delete(sources).where(eq(sources.id, sourceId));
    await db.delete(entities).where(eq(entities.id, entityId));
  });
});
