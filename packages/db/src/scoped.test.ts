import { describe, expect, test } from "bun:test";
import dotenv from "dotenv";
import { inArray } from "drizzle-orm";

dotenv.config({ path: "../../apps/server/.env" });

import { getDb } from "./client";
import { actions } from "./schema";
import { scopedDb } from "./scoped";

/**
 * Data-model acceptance: "scopedDb proves isolation — a cross-org read test
 * fails without the helper, passes with it." Runs against DATABASE_URL;
 * skipped when none is configured (CI without a database).
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("scopedDb isolation", () => {
  const orgA = `org_test_a_${Date.now()}`;
  const orgB = `org_test_b_${Date.now()}`;

  test("raw db leaks across orgs; scopedDb does not", async () => {
    const db = getDb();
    const a = scopedDb(orgA, db);
    const b = scopedDb(orgB, db);

    await a.insert(actions, {
      sourceType: "signal",
      sourceId: crypto.randomUUID(),
      description: "org A action",
    });
    await b.insert(actions, {
      sourceType: "signal",
      sourceId: crypto.randomUUID(),
      description: "org B action",
    });

    try {
      // Without the helper: both orgs' rows are reachable — the leak the
      // helper exists to prevent.
      const raw = await db
        .select()
        .from(actions)
        .where(inArray(actions.workosOrgId, [orgA, orgB]));
      expect(raw).toHaveLength(2);

      // With the helper: each org sees only its own rows.
      const aRows = await a.select(actions);
      expect(aRows).toHaveLength(1);
      expect(aRows[0]!.description).toBe("org A action");

      const bRows = await b.select(actions);
      expect(bRows).toHaveLength(1);
      expect(bRows[0]!.description).toBe("org B action");

      // Writes are stamped: the helper refuses to write another org's rows.
      await a.update(actions, { status: "done" });
      const bAfter = await b.select(actions);
      expect(bAfter[0]!.status).toBe("open");
    } finally {
      await db
        .delete(actions)
        .where(inArray(actions.workosOrgId, [orgA, orgB]));
    }
  });

  test("rejects empty org id", () => {
    expect(() => scopedDb("")).toThrow();
  });
});
