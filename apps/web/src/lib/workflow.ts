import { redirect } from "next/navigation";
import { and, desc, eq, gte, inArray } from "drizzle-orm";

import {
  actions,
  battlecards,
  briefings,
  changes,
  entities,
  evidence,
  getDb,
  insights,
  missions,
  orgEntities,
  reports,
  scopedDb,
  signals,
  sources,
} from "@ayeastra/db";
import {
  missionRelevant,
  parseReportLayout,
  parseWatchSpec,
  REPORT_BLOCK_TITLES,
  type RenderedReportBlock,
  type ReportBlock,
  workflowEntitled,
} from "@ayeastra/workflow";

import { requireActiveSubscription, type BilledOrgSession } from "./auth";

/** Workflow layer (3.2) is Business/Enterprise per pricing. */
export async function requireWorkflow(): Promise<BilledOrgSession> {
  const session = await requireActiveSubscription();
  if (!workflowEntitled(session.billing.plan)) redirect("/settings/billing");
  return session;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function listMissions(orgId: string) {
  const scoped = scopedDb(orgId);
  const rows = await scoped.select(missions);
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getMission(orgId: string, id: string) {
  const db = getDb();
  const scoped = scopedDb(orgId, db);
  const [mission] = await scoped.select(missions, eq(missions.id, id));
  if (!mission) return null;

  const lens = {
    entityIds: mission.entityIds,
    watchSpec: parseWatchSpec(mission.watchSpec),
    priorityId: mission.priorityId,
  };
  const recent = await scoped.select(
    signals,
    gte(signals.createdAt, new Date(Date.now() - 30 * DAY_MS)),
  );
  const names = await entityNames(mission.entityIds.concat(recent.map((s) => s.entityId)));
  const feed = recent
    .filter((s) => missionRelevant(lens, s))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((s) => ({ ...s, entity: names.get(s.entityId) ?? "Unknown" }));

  const missionActions = await scoped.select(
    actions,
    and(eq(actions.sourceType, "mission"), eq(actions.sourceId, mission.id)),
  );

  return {
    mission,
    lens,
    feed,
    entityNames: mission.entityIds.map((e) => names.get(e) ?? "Unknown"),
    actions: missionActions.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    ),
  };
}

async function entityNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await getDb()
    .select({ id: entities.id, name: entities.canonicalName })
    .from(entities)
    .where(inArray(entities.id, unique));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Latest Board Mode artifact (briefings table, kind "board"). */
export async function getLatestBoard(orgId: string) {
  const scoped = scopedDb(orgId);
  const rows = await scoped.select(briefings, eq(briefings.kind, "board"));
  return (
    rows
      .filter((b) => b.status === "ready" || b.status === "delivered")
      .sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : -1))[0] ?? null
  );
}

export async function listReports(orgId: string) {
  const scoped = scopedDb(orgId);
  const rows = await scoped.select(reports);
  return rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export async function getReport(orgId: string, id: string) {
  const scoped = scopedDb(orgId);
  const [report] = await scoped.select(reports, eq(reports.id, id));
  return report ?? null;
}

/**
 * Fetch each layout block's data — every line carries its evidence chip.
 * A report is a curated view over existing objects, never new prose.
 */
export async function fetchReportBlocks(
  orgId: string,
  layoutRaw: unknown,
): Promise<RenderedReportBlock[]> {
  const layout = parseReportLayout(layoutRaw);
  // Blocks are independent — fetch them in parallel (≤12 per layout).
  return Promise.all(
    layout.blocks.map(async (block) => ({
      title: REPORT_BLOCK_TITLES[block.kind],
      lines: await fetchBlockLines(orgId, block),
    })),
  );
}

async function fetchBlockLines(
  orgId: string,
  block: ReportBlock,
): Promise<RenderedReportBlock["lines"]> {
  const db = getDb();
  const scoped = scopedDb(orgId, db);

  switch (block.kind) {
    case "entity_timeline":
    case "diff_gallery":
    case "pricing_history": {
      const since =
        block.kind === "entity_timeline"
          ? new Date(Date.now() - block.days * DAY_MS)
          : new Date(0);
      // Global changes are reachable ONLY through the org's watch list —
      // the innerJoin on org_entities gates access so a hand-crafted layout
      // can't dump change history for an entity this org never configured.
      const rows = await db
        .select({
          summary: changes.summary,
          category: changes.category,
          detectedAt: changes.detectedAt,
          materiality: changes.materiality,
          evidenceId: evidence.id,
        })
        .from(changes)
        .innerJoin(sources, eq(changes.sourceId, sources.id))
        .innerJoin(
          orgEntities,
          and(
            eq(orgEntities.entityId, sources.entityId),
            eq(orgEntities.workosOrgId, orgId),
          ),
        )
        .leftJoin(evidence, eq(evidence.changeId, changes.id))
        .where(
          and(
            eq(sources.entityId, block.entityId),
            gte(changes.detectedAt, since),
            ...(block.kind === "pricing_history"
              ? [eq(changes.category, "pricing")]
              : [eq(changes.materiality, "material")]),
          ),
        )
        .orderBy(desc(changes.detectedAt))
        .limit("limit" in block ? block.limit : 20);
      return rows.map((r) => ({
        text: `${r.detectedAt.toISOString().slice(0, 10)} · ${
          r.summary ?? `${r.category ?? "uncategorized"} change (${r.materiality})`
        }`,
        evidenceId: r.evidenceId,
      }));
    }
    case "signal_digest": {
      const rows = await scoped.select(
        signals,
        and(
          inArray(signals.category, block.categories),
          gte(signals.createdAt, new Date(Date.now() - block.days * DAY_MS)),
        ),
      );
      return rows
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, block.limit)
        .map((s) => ({
          text: `${s.createdAt.toISOString().slice(0, 10)} · ${s.finding}`,
          evidenceId: s.evidenceIds[0] ?? null,
        }));
    }
    case "battlecard_excerpt": {
      const [card] = await scoped.select(
        battlecards,
        eq(battlecards.entityId, block.entityId),
      );
      const section = (
        card?.sections as Record<string, { content?: string }> | null
      )?.[block.sectionKey];
      return section?.content
        ? [{ text: `${block.sectionKey}: ${section.content}`, evidenceId: null }]
        : [];
    }
    case "insight_block": {
      const rows = await scoped.select(insights);
      return rows
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, block.limit)
        .map((i) => ({
          text: `${i.pattern} — ${i.analysis}`,
          evidenceId: i.evidenceIds[0] ?? null,
        }));
    }
  }
}
