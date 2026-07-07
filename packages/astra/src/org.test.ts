import { describe, expect, test } from "bun:test";
import dotenv from "dotenv";
import { inArray } from "drizzle-orm";

dotenv.config({ path: "../../apps/server/.env" });

import { entities, entityAliases, getDb, orgEntities, scopedDb } from "@ayeastra/db";

import { listWatched, resolveEntityNames } from "./org";

const hasDb = Boolean(process.env.DATABASE_URL);

describe("resolveEntityNames", () => {
  const watched = [
    { entityId: "id-1", name: "PayBridge", aliases: ["paybridge.io", "PayBridge Inc"] },
    { entityId: "id-2", name: "LedgerLine", aliases: [] },
  ];

  test("matches canonical names and aliases case-insensitively, dedupes", () => {
    const r = resolveEntityNames(
      ["paybridge", "PAYBRIDGE INC", "ledgerline", "GhostCo"],
      watched,
    );
    expect(r.entityIds).toEqual(["id-1", "id-2"]);
    expect(r.unmatched).toEqual(["GhostCo"]);
  });

  test("empty input resolves to nothing", () => {
    expect(resolveEntityNames([], watched)).toEqual({ entityIds: [], unmatched: [] });
  });
});

describe.skipIf(!hasDb)("astra org isolation (real db)", () => {
  const suffix = Date.now();
  const orgA = `org_astra_a_${suffix}`;
  const orgB = `org_astra_b_${suffix}`;

  test("listWatched is org-bounded and carries aliases", async () => {
    const db = getDb();
    const a = scopedDb(orgA, db);
    const [entity] = await db
      .insert(entities)
      .values({ type: "company", canonicalName: `AstraCo ${suffix}` })
      .returning();
    await db.insert(entityAliases).values({
      entityId: entity!.id,
      alias: `astraco-${suffix}`,
      source: "user",
    });
    await a.insert(orgEntities, { entityId: entity!.id, role: "competitor" });

    try {
      const forA = await listWatched(a, db);
      expect(forA).toHaveLength(1);
      expect(forA[0]!.name).toBe(`AstraCo ${suffix}`);
      expect(forA[0]!.aliases).toContain(`astraco-${suffix}`);

      // The identical lookup from another org sees nothing.
      const forB = await listWatched(scopedDb(orgB, db), db);
      expect(forB).toHaveLength(0);
    } finally {
      await db
        .delete(orgEntities)
        .where(inArray(orgEntities.workosOrgId, [orgA, orgB]));
      await db
        .delete(entityAliases)
        .where(inArray(entityAliases.entityId, [entity!.id]));
      await db.delete(entities).where(inArray(entities.id, [entity!.id]));
    }
  }, 30_000);
});
