import { and, eq, sql } from "drizzle-orm";

import { entities, entityAliases, getDb, type Database } from "@ayeastra/db";

/**
 * Entity resolution (context doc checklist #4): "Stripe" is one global
 * object no matter how many orgs mention it. Domain match → alias match →
 * create (which should trigger source.discover at the call site).
 *
 * Domain outranks alias — it's the strongest identity signal, and names
 * collide globally ("Mercury" the bank vs "Mercury" the email tool). The
 * alias lookup is constrained to the requested entity type so a market
 * watch can never bind to a company that shares its name.
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
  const type = args.type ?? "company";

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

  const [byAlias] = await db
    .select({ entityId: entityAliases.entityId })
    .from(entityAliases)
    .innerJoin(entities, eq(entities.id, entityAliases.entityId))
    .where(
      and(
        sql`lower(${entityAliases.alias}) = ${name.toLowerCase()}`,
        eq(entities.type, type),
      ),
    )
    .limit(1);
  if (byAlias) return { entityId: byAlias.entityId, created: false };

  const [created] = await db
    .insert(entities)
    .values({
      type,
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
