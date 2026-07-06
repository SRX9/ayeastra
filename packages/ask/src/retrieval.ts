import {
  and,
  cosineDistance,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  sql,
  type SQL,
} from "drizzle-orm";

import {
  changes,
  getDb,
  orgEntities,
  signals,
  sources,
  type Database,
  type signalCategory,
} from "@ayeastra/db";

/**
 * Org-isolated retrieval over the intelligence archive (ask doc §Index).
 * One index, filtered by org at query time: signals carry the org id;
 * global changes are reachable ONLY through the org's org_entities join —
 * same isolation discipline as scopedDb. Every function here takes orgId
 * as its first argument; nothing retrieves without it.
 */

export interface AskFilters {
  entityIds?: string[];
  from?: Date;
  to?: Date;
  categories?: (typeof signalCategory.enumValues)[number][];
}

export interface RetrievedItem {
  /** "signal:{id}" / "change:{id}" — stable across vector+keyword lists. */
  id: string;
  kind: "signal" | "change";
  text: string;
  entityId: string;
  date: Date;
  /** Vector: cosine similarity [0..1]. Keyword: ts_rank (different scale). */
  score: number;
  evidenceIds: string[];
}

const DEFAULT_K = 20;

function signalFilters(orgId: string, f: AskFilters): SQL[] {
  const where: SQL[] = [eq(signals.workosOrgId, orgId)];
  if (f.entityIds?.length) where.push(inArray(signals.entityId, f.entityIds));
  if (f.from) where.push(gte(signals.createdAt, f.from));
  if (f.to) where.push(lte(signals.createdAt, f.to));
  if (f.categories?.length) where.push(inArray(signals.category, f.categories));
  return where;
}

export async function retrieveSignalsByVector(
  orgId: string,
  embedding: number[],
  filters: AskFilters = {},
  k = DEFAULT_K,
  db: Database = getDb(),
): Promise<RetrievedItem[]> {
  const similarity = sql<number>`1 - (${cosineDistance(signals.embedding, embedding)})`;
  const rows = await db
    .select({
      id: signals.id,
      finding: signals.finding,
      whyItMatters: signals.whyItMatters,
      entityId: signals.entityId,
      date: signals.createdAt,
      score: similarity,
      evidenceIds: signals.evidenceIds,
    })
    .from(signals)
    .where(and(...signalFilters(orgId, filters), isNotNull(signals.embedding)))
    .orderBy(desc(similarity))
    .limit(k);
  return rows.map((r) => ({
    id: `signal:${r.id}`,
    kind: "signal" as const,
    text: `${r.finding} ${r.whyItMatters}`,
    entityId: r.entityId,
    date: r.date,
    score: Number(r.score),
    evidenceIds: r.evidenceIds,
  }));
}

export async function retrieveSignalsByKeyword(
  orgId: string,
  query: string,
  filters: AskFilters = {},
  k = DEFAULT_K,
  db: Database = getDb(),
): Promise<RetrievedItem[]> {
  const document = sql`to_tsvector('english', ${signals.finding} || ' ' || ${signals.whyItMatters})`;
  const tsQuery = sql`websearch_to_tsquery('english', ${query})`;
  const rank = sql<number>`ts_rank(${document}, ${tsQuery})`;
  const rows = await db
    .select({
      id: signals.id,
      finding: signals.finding,
      whyItMatters: signals.whyItMatters,
      entityId: signals.entityId,
      date: signals.createdAt,
      score: rank,
      evidenceIds: signals.evidenceIds,
    })
    .from(signals)
    .where(and(...signalFilters(orgId, filters), sql`${document} @@ ${tsQuery}`))
    .orderBy(desc(rank))
    .limit(k);
  return rows.map((r) => ({
    id: `signal:${r.id}`,
    kind: "signal" as const,
    text: `${r.finding} ${r.whyItMatters}`,
    entityId: r.entityId,
    date: r.date,
    score: Number(r.score),
    evidenceIds: r.evidenceIds,
  }));
}

/**
 * Global changes, reachable only through the org's active org_entities rows.
 * Cosmetic changes are archive-only and never retrieved.
 */
export async function retrieveChangesByVector(
  orgId: string,
  embedding: number[],
  filters: AskFilters = {},
  k = DEFAULT_K,
  db: Database = getDb(),
): Promise<RetrievedItem[]> {
  const similarity = sql<number>`1 - (${cosineDistance(changes.embedding, embedding)})`;
  const where: SQL[] = [
    isNotNull(changes.embedding),
    // Summary-less changes would reach the reranker as empty-text candidates,
    // wasting slots the refusal gate counts as support.
    isNotNull(changes.summary),
    ne(changes.materiality, "cosmetic"),
  ];
  if (filters.entityIds?.length) {
    where.push(inArray(sources.entityId, filters.entityIds));
  }
  if (filters.from) where.push(gte(changes.detectedAt, filters.from));
  if (filters.to) where.push(lte(changes.detectedAt, filters.to));
  if (filters.categories?.length) {
    where.push(inArray(changes.category, filters.categories));
  }
  const rows = await db
    .select({
      id: changes.id,
      summary: changes.summary,
      entityId: sources.entityId,
      date: changes.detectedAt,
      score: similarity,
    })
    .from(changes)
    .innerJoin(sources, eq(changes.sourceId, sources.id))
    .innerJoin(
      orgEntities,
      and(
        eq(orgEntities.entityId, sources.entityId),
        eq(orgEntities.workosOrgId, orgId),
        isNull(orgEntities.archivedAt),
      ),
    )
    .where(and(...where))
    .orderBy(desc(similarity))
    .limit(k);
  return rows.map((r) => ({
    id: `change:${r.id}`,
    kind: "change" as const,
    text: r.summary ?? "",
    entityId: r.entityId,
    date: r.date,
    score: Number(r.score),
    evidenceIds: [],
  }));
}
