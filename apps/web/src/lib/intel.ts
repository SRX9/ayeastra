import { and, desc, eq, inArray, lt, sql, type SQL } from "drizzle-orm";

import {
  battlecards,
  briefings,
  entities,
  evidence,
  getDb,
  monitorState,
  orgEntities,
  scopedDb,
  signals,
  sources,
  type severity as severityEnum,
  type signalCategory,
} from "@ayeastra/db";

/**
 * Org-scoped reads for the six surfaces. Joins use scopedDb's `scope`
 * predicate (the sanctioned path for hand-built queries) — no per-org table
 * is ever read without the org predicate.
 */

export type Severity = (typeof severityEnum.enumValues)[number];
export type Category = (typeof signalCategory.enumValues)[number];

export interface SignalFilters {
  severity?: Severity;
  category?: Category;
  entityId?: string;
  /** Cursor: strictly-older-than this signal id. Ids are uuidv7 (time-ordered
   * and unique), so id pagination can't skip same-timestamp rows the way a
   * millisecond-truncated createdAt cursor does. */
  before?: string;
}

const FEED_PAGE_SIZE = 20;

export async function listSignals(orgId: string, filters: SignalFilters = {}) {
  const db = getDb();
  const scoped = scopedDb(orgId, db);
  const where: SQL[] = [scoped.scope(signals)];
  if (filters.severity) where.push(eq(signals.severity, filters.severity));
  if (filters.category) where.push(eq(signals.category, filters.category));
  if (filters.entityId) where.push(eq(signals.entityId, filters.entityId));
  if (filters.before) where.push(lt(signals.id, filters.before));

  const rows = await db
    .select({
      id: signals.id,
      entityId: signals.entityId,
      entityName: entities.canonicalName,
      category: signals.category,
      severity: signals.severity,
      confidence: signals.confidence,
      finding: signals.finding,
      whyItMatters: signals.whyItMatters,
      recommendedAction: signals.recommendedAction,
      confidenceNotes: signals.confidenceNotes,
      priorityAttachments: signals.priorityAttachments,
      evidenceIds: signals.evidenceIds,
      status: signals.status,
      createdAt: signals.createdAt,
    })
    .from(signals)
    .innerJoin(entities, eq(signals.entityId, entities.id))
    .where(and(...where))
    .orderBy(desc(signals.id))
    .limit(FEED_PAGE_SIZE + 1);

  return {
    signals: rows.slice(0, FEED_PAGE_SIZE),
    nextCursor:
      rows.length > FEED_PAGE_SIZE ? rows[FEED_PAGE_SIZE - 1]!.id : null,
  };
}

export type FeedSignal = Awaited<
  ReturnType<typeof listSignals>
>["signals"][number];

/** Cold-start numbers for the honest empty state. */
export async function watchStats(orgId: string) {
  const db = getDb();
  const scoped = scopedDb(orgId, db);
  const [row] = await db
    .select({
      entityCount: sql<number>`count(distinct ${orgEntities.entityId})::int`,
      sourceCount: sql<number>`count(${sources.id})::int`,
    })
    .from(orgEntities)
    .leftJoin(sources, eq(sources.entityId, orgEntities.entityId))
    .where(
      and(scoped.scope(orgEntities), sql`${orgEntities.archivedAt} is null`),
    );
  return row ?? { entityCount: 0, sourceCount: 0 };
}

export async function listWatchedEntities(orgId: string) {
  const db = getDb();
  const scoped = scopedDb(orgId, db);
  return db
    .select({
      entityId: orgEntities.entityId,
      name: entities.canonicalName,
      domain: entities.domain,
      role: orgEntities.role,
      tier: orgEntities.tier,
      addedAt: orgEntities.addedAt,
      signalCount: sql<number>`(
        select count(*)::int from ${signals}
        where ${signals.workosOrgId} = ${orgId}
          and ${signals.entityId} = ${orgEntities.entityId}
      )`,
    })
    .from(orgEntities)
    .innerJoin(entities, eq(orgEntities.entityId, entities.id))
    .where(and(scoped.scope(orgEntities), sql`${orgEntities.archivedAt} is null`))
    .orderBy(entities.canonicalName);
}

export async function getEntityDetail(orgId: string, entityId: string) {
  const db = getDb();
  const scoped = scopedDb(orgId, db);

  const [watch] = await db
    .select({
      role: orgEntities.role,
      tier: orgEntities.tier,
      notes: orgEntities.notes,
      name: entities.canonicalName,
      domain: entities.domain,
      description: entities.description,
    })
    .from(orgEntities)
    .innerJoin(entities, eq(orgEntities.entityId, entities.id))
    .where(and(scoped.scope(orgEntities), eq(orgEntities.entityId, entityId)));
  if (!watch) return null;

  const [coverage, recentSignals, [battlecard]] = await Promise.all([
    db
      .select({
        id: sources.id,
        url: sources.url,
        kind: sources.kind,
        status: sources.status,
        intervalMinutes: monitorState.checkIntervalMinutes,
        nextCheckAt: monitorState.nextCheckAt,
        lastChangeAt: monitorState.lastChangeAt,
      })
      .from(sources)
      .leftJoin(monitorState, eq(monitorState.sourceId, sources.id))
      .where(eq(sources.entityId, entityId))
      .orderBy(sources.kind),
    listSignals(orgId, { entityId }),
    db
      .select()
      .from(battlecards)
      .where(and(scoped.scope(battlecards), eq(battlecards.entityId, entityId))),
  ]);

  return { ...watch, coverage, signals: recentSignals.signals, battlecard };
}

export async function listBriefings(orgId: string) {
  const db = getDb();
  const scoped = scopedDb(orgId, db);
  return db
    .select({
      id: briefings.id,
      kind: briefings.kind,
      periodStart: briefings.periodStart,
      periodEnd: briefings.periodEnd,
      status: briefings.status,
      deliveredAt: briefings.deliveredAt,
      createdAt: briefings.createdAt,
    })
    .from(briefings)
    .where(
      and(
        scoped.scope(briefings),
        inArray(briefings.status, ["ready", "delivered"]),
      ),
    )
    .orderBy(desc(briefings.periodEnd));
}

export async function getBriefing(orgId: string, id: string) {
  const scoped = scopedDb(orgId);
  const rows = await scoped.select(briefings, eq(briefings.id, id));
  const briefing = rows[0];
  return briefing && ["ready", "delivered"].includes(briefing.status)
    ? briefing
    : null;
}

/** Public share route: global table, gated ONLY by the unguessable token. */
export async function getSharedEvidence(id: string, token: string) {
  if (!token) return null;
  const db = getDb();
  const [row] = await db
    .select()
    .from(evidence)
    .where(and(eq(evidence.id, id), eq(evidence.shareToken, token)));
  return row ?? null;
}
