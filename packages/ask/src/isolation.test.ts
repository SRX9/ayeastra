import { describe, expect, test } from "bun:test";
import dotenv from "dotenv";
import { inArray } from "drizzle-orm";

dotenv.config({ path: "../../apps/server/.env" });

import {
  askMessages,
  askThreads,
  changes,
  entities,
  getDb,
  orgEntities,
  scopedDb,
  signals,
  snapshots,
  sources,
} from "@ayeastra/db";

import {
  retrieveChangesByVector,
  retrieveSignalsByKeyword,
  retrieveSignalsByVector,
} from "./retrieval";
import { appendMessage, createThread } from "./threads";

/**
 * Ask acceptance: "identical question from a second org returns only its
 * own intelligence." Real DB, real vectors; skipped without DATABASE_URL.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

/** 1536-dim unit vector along one axis — cosine similarity 1 with itself. */
function basisVector(axis: number): number[] {
  const v = new Array(1536).fill(0);
  v[axis] = 1;
  return v;
}

describe.skipIf(!hasDb)("ask retrieval org isolation", () => {
  const suffix = Date.now();
  const orgA = `org_ask_a_${suffix}`;
  const orgB = `org_ask_b_${suffix}`;

  test("vector, keyword, and change retrieval are org-bounded", async () => {
    // Remote dev DB: many round-trips, well past bun's 5s default.
    const db = getDb();
    const a = scopedDb(orgA, db);
    const embedding = basisVector(7);

    // Fixture: one entity watched by org A only, with a change + signal.
    const [entity] = await db
      .insert(entities)
      .values({ type: "company", canonicalName: `AskCo ${suffix}` })
      .returning();
    const [source] = await db
      .insert(sources)
      .values({
        entityId: entity!.id,
        url: `https://askco-${suffix}.test/pricing`,
        kind: "pricing",
        discovery: "user",
      })
      .returning();
    const snapshotRows = await db
      .insert(snapshots)
      .values(
        [1, 2].map((n) => ({
          sourceId: source!.id,
          contentHash: `hash-${n}-${suffix}`,
          r2HtmlKey: `test/${suffix}/${n}.html`,
          r2MdKey: `test/${suffix}/${n}.md`,
        })),
      )
      .returning();
    const [change] = await db
      .insert(changes)
      .values({
        sourceId: source!.id,
        beforeSnapshotId: snapshotRows[0]!.id,
        afterSnapshotId: snapshotRows[1]!.id,
        materiality: "material",
        category: "pricing",
        summary: "AskCo cut Pro plan price from $499 to $399",
        embedding,
      })
      .returning();
    await a.insert(orgEntities, { entityId: entity!.id, role: "competitor" });
    await a.insert(signals, {
      changeId: change!.id,
      entityId: entity!.id,
      category: "pricing",
      severity: "high",
      confidence: "high",
      finding: "AskCo cut Pro pricing 20%",
      whyItMatters: "Puts pressure on premium positioning",
      contextVersion: 1,
      evidenceIds: [],
      dedupKey: `test:${suffix}`,
      embedding,
    });

    try {
      // Org A sees its intelligence…
      const aVector = await retrieveSignalsByVector(orgA, embedding, {}, 20, db);
      expect(aVector.length).toBe(1);
      expect(aVector[0]!.score).toBeCloseTo(1, 5);

      const aKeyword = await retrieveSignalsByKeyword(orgA, "pricing", {}, 20, db);
      expect(aKeyword.length).toBe(1);

      const aChanges = await retrieveChangesByVector(orgA, embedding, {}, 20, db);
      expect(aChanges.length).toBe(1);

      // …org B, asking the identical question, sees nothing.
      expect(await retrieveSignalsByVector(orgB, embedding, {}, 20, db)).toHaveLength(0);
      expect(await retrieveSignalsByKeyword(orgB, "pricing", {}, 20, db)).toHaveLength(0);
      expect(await retrieveChangesByVector(orgB, embedding, {}, 20, db)).toHaveLength(0);
    } finally {
      await db.delete(signals).where(inArray(signals.workosOrgId, [orgA, orgB]));
      await db.delete(orgEntities).where(inArray(orgEntities.workosOrgId, [orgA, orgB]));
      await db.delete(changes).where(inArray(changes.sourceId, [source!.id]));
      await db.delete(snapshots).where(inArray(snapshots.sourceId, [source!.id]));
      await db.delete(sources).where(inArray(sources.id, [source!.id]));
      await db.delete(entities).where(inArray(entities.id, [entity!.id]));
    }
  }, 30_000);

  test("thread access requires org ownership", async () => {
    const db = getDb();
    const a = scopedDb(orgA, db);
    const b = scopedDb(orgB, db);
    const threadId = await createThread(a, "user_1", "PayBridge recap");
    try {
      await appendMessage(a, threadId, "user", "What has PayBridge done?");
      // Plain try/catch: bun's expect().rejects misbehaves with drizzle's
      // thenable query builders (captures a spurious query error).
      let thrown: Error | undefined;
      try {
        await appendMessage(b, threadId, "user", "steal thread");
      } catch (e) {
        thrown = e as Error;
      }
      expect(thrown?.message).toContain("not found");
    } finally {
      await db.delete(askMessages).where(inArray(askMessages.threadId, [threadId]));
      await db.delete(askThreads).where(inArray(askThreads.id, [threadId]));
    }
  }, 30_000);
});
