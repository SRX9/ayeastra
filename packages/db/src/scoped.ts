import { and, eq, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

import { getDb, type Database } from "./client";

/** Any per-org table: carries workos_org_id (intelligence-layer tables). */
export type OrgScopedTable = PgTable & { workosOrgId: PgColumn };

type InsertValues<T extends OrgScopedTable> = Omit<
  T["$inferInsert"],
  "workosOrgId"
>;

/**
 * The ONLY way app code touches per-org tables (data-model law #3):
 * every read is predicated on the org, every write stamps it. Raw `db`
 * access to a table with workos_org_id is a code-review reject.
 */
export function scopedDb(orgId: string, db: Database = getDb()) {
  if (!orgId) throw new Error("scopedDb: orgId is required");

  const scope = <T extends OrgScopedTable>(table: T): SQL =>
    eq(table.workosOrgId, orgId);

  return {
    orgId,

    /** Org predicate for hand-built queries (joins, aggregates). */
    scope,

    select<T extends OrgScopedTable>(table: T, where?: SQL) {
      return db
        .select()
        .from(table as PgTable)
        .where(where ? and(scope(table), where) : scope(table)) as Promise<
        T["$inferSelect"][]
      >;
    },

    insert<T extends OrgScopedTable>(
      table: T,
      values: InsertValues<T> | InsertValues<T>[],
    ) {
      const rows = (Array.isArray(values) ? values : [values]).map((v) => ({
        ...v,
        workosOrgId: orgId,
      }));
      return db.insert(table).values(rows as T["$inferInsert"][]);
    },

    update<T extends OrgScopedTable>(
      table: T,
      set: Partial<InsertValues<T>>,
      where?: SQL,
    ) {
      return db
        .update(table)
        // Safe: InsertValues<T> is $inferInsert minus workosOrgId, which
        // scoped updates must never touch anyway.
        .set(set as T["$inferInsert"])
        .where(where ? and(scope(table), where) : scope(table));
    },
  };
}

export type ScopedDb = ReturnType<typeof scopedDb>;
