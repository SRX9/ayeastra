import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import {
  applyRefresh,
  CardSections,
  sectionsForCategory,
  type ChangelogEntry,
  type SectionKey,
} from "@ayeastra/battlecards";
import { battlecards, changes, getDb, scopedDb, signals } from "@ayeastra/db";
import { defineJob } from "@ayeastra/jobs";

/**
 * battlecard.refresh (battlecard doc) — event-driven card refresh via
 * applyRefresh (edit-safe: edited sections are flagged stale, never
 * rewritten). Regenerated content is DETERMINISTIC — pricing tables render
 * from extracted_facts and recent moves from signal findings; no model call
 * invents card prose.
 */

const RECENT_MOVES_LIMIT = 10;

export const battlecardRefresh = defineJob({
  name: "battlecard.refresh",
  payload: z.object({ orgId: z.string().min(1), signalId: z.uuid() }),
  idempotencyKey: (p) => `battlecard:${p.signalId}`,
  run: async (payload) => {
    const db = getDb();
    const scoped = scopedDb(payload.orgId, db);

    const [signal] = await scoped.select(signals, eq(signals.id, payload.signalId));
    if (!signal) return;
    const affected = sectionsForCategory(signal.category);
    if (affected.length === 0) return;

    const regenerated: Partial<Record<SectionKey, string>> = {};
    if (affected.includes("recent_moves")) {
      const recent = await db
        .select({ finding: signals.finding, createdAt: signals.createdAt })
        .from(signals)
        .where(and(scoped.scope(signals), eq(signals.entityId, signal.entityId)))
        .orderBy(desc(signals.createdAt))
        .limit(RECENT_MOVES_LIMIT);
      regenerated.recent_moves = recent
        .map((s) => `- ${s.finding} (${s.createdAt.toISOString().slice(0, 10)})`)
        .join("\n");
    }
    if (affected.includes("pricing_table")) {
      const table = await pricingTable(db, signal.changeId);
      if (table) regenerated.pricing_table = table;
    }
    if (Object.keys(regenerated).length === 0) return;

    const [card] = await scoped.select(battlecards, eq(battlecards.entityId, signal.entityId));
    const existing = CardSections.parse(card?.sections ?? {});
    const result = applyRefresh({
      existing,
      regenerated,
      signalId: signal.id,
      reason: signal.finding,
    });
    if (result.changelog.length === 0) return; // no-op regen — no churn

    const changelog = [
      ...(((card?.changelog ?? []) as ChangelogEntry[])),
      ...result.changelog,
    ];
    await scoped
      .insert(battlecards, {
        entityId: signal.entityId,
        sections: result.sections,
        changelog,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [battlecards.workosOrgId, battlecards.entityId],
        set: { sections: result.sections, changelog, updatedAt: new Date() },
      });
  },
});

/** Markdown pricing table from the change's code-compared extraction —
 * numbers come from extracted_facts, never prose (diff doc stage 3). */
async function pricingTable(
  db: ReturnType<typeof getDb>,
  changeId: string,
): Promise<string | null> {
  const [change] = await db
    .select({ extractedFacts: changes.extractedFacts })
    .from(changes)
    .where(eq(changes.id, changeId));
  const facts = change?.extractedFacts as {
    kind?: string;
    after?: { plans?: Array<{ name: string; priceText: string | null; period: string; features: string[] }> };
  } | null;
  if (facts?.kind !== "pricing" || !facts.after?.plans?.length) return null;
  const rows = facts.after.plans.map(
    (p) => `| ${p.name} | ${p.priceText ?? "—"} | ${p.period} | ${p.features.slice(0, 4).join(", ")} |`,
  );
  return ["| Plan | Price | Period | Key features |", "| --- | --- | --- | --- |", ...rows].join("\n");
}
