import { eq, sql } from "drizzle-orm";

import { entities, entityAliases, getDb, type Database } from "@ayeastra/db";

/**
 * Entity resolution (context doc checklist #4): "Stripe" is one global
 * object no matter how many orgs mention it. Alias match → domain match →
 * create (which should trigger source.discover at the call site).
 */
export async function resolveEntity(args: {
  name: string;
  domain?: string;
  /** Market-type entities are category watches (2.1); default company. */
  type?: "company" | "market";
  db?: Database;
}): Promise<{ entityId: string; created: boolean }> {
  const db = args.db ?? getDb();
  const name = args.name.trim();

  const [byAlias] = await db
    .select({ entityId: entityAliases.entityId })
    .from(entityAliases)
    .where(sql`lower(${entityAliases.alias}) = ${name.toLowerCase()}`)
    .limit(1);
  if (byAlias) return { entityId: byAlias.entityId, created: false };

  if (args.domain) {
    const [byDomain] = await db
      .select({ id: entities.id })
      .from(entities)
      .where(eq(entities.domain, normalizeDomain(args.domain)))
      .limit(1);
    if (byDomain) {
      await addAlias(db, byDomain.id, name);
      return { entityId: byDomain.id, created: false };
    }
  }

  const [created] = await db
    .insert(entities)
    .values({
      type: args.type ?? "company",
      canonicalName: name,
      domain: args.domain ? normalizeDomain(args.domain) : null,
    })
    .returning({ id: entities.id });
  await addAlias(db, created!.id, name);
  return { entityId: created!.id, created: true };
}

async function addAlias(db: Database, entityId: string, alias: string) {
  await db
    .insert(entityAliases)
    .values({ entityId, alias, source: "resolution" })
    .onConflictDoNothing();
}

function normalizeDomain(domain: string): string {
  return domain
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}
