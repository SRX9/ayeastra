import { and, eq, inArray, isNull } from "drizzle-orm";

import {
  entities,
  entityAliases,
  getDb,
  orgEntities,
  orgModules,
  type Database,
  type ScopedDb,
} from "@ayeastra/db";

/**
 * Org lookups shared by sources and the system prompt — watched entities
 * (with aliases, for entity-name resolution) and active modules. All reads
 * go through the scoped predicate; global tables are only reachable via the
 * org's org_entities join, same discipline as packages/ask retrieval.
 */

export interface WatchedEntity {
  entityId: string;
  name: string;
  aliases: string[];
}

export async function listWatched(
  scoped: ScopedDb,
  db: Database = getDb(),
): Promise<WatchedEntity[]> {
  const rows = await db
    .select({ entityId: orgEntities.entityId, name: entities.canonicalName })
    .from(orgEntities)
    .innerJoin(entities, eq(orgEntities.entityId, entities.id))
    .where(and(scoped.scope(orgEntities), isNull(orgEntities.archivedAt)))
    .orderBy(entities.canonicalName);
  if (rows.length === 0) return [];

  const aliasRows = await db
    .select({ entityId: entityAliases.entityId, alias: entityAliases.alias })
    .from(entityAliases)
    .where(
      inArray(
        entityAliases.entityId,
        rows.map((r) => r.entityId),
      ),
    );
  const aliasesByEntity = new Map<string, string[]>();
  for (const a of aliasRows) {
    const list = aliasesByEntity.get(a.entityId) ?? [];
    list.push(a.alias);
    aliasesByEntity.set(a.entityId, list);
  }
  return rows.map((r) => ({
    entityId: r.entityId,
    name: r.name,
    aliases: aliasesByEntity.get(r.entityId) ?? [],
  }));
}

/** Case-insensitive name/alias match → entity ids. Returns unmatched names
 * so the caller can report coverage gaps honestly instead of guessing. */
export function resolveEntityNames(
  names: string[],
  watched: WatchedEntity[],
): { entityIds: string[]; unmatched: string[] } {
  const entityIds: string[] = [];
  const unmatched: string[] = [];
  for (const name of names) {
    const needle = name.trim().toLowerCase();
    const hit = watched.find(
      (w) =>
        w.name.toLowerCase() === needle ||
        w.aliases.some((a) => a.toLowerCase() === needle),
    );
    if (hit && !entityIds.includes(hit.entityId)) entityIds.push(hit.entityId);
    else if (!hit) unmatched.push(name);
  }
  return { entityIds, unmatched };
}

export async function listActiveModules(scoped: ScopedDb): Promise<string[]> {
  const rows = await scoped.select(orgModules, isNull(orgModules.deactivatedAt));
  return rows.map((r) => r.moduleKey);
}
