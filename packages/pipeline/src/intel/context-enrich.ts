import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { marketFeedUrls } from "@ayeastra/collection/discovery";
import { currentContext } from "@ayeastra/core";
import { entities, getDb, orgEntities, scopedDb, sources } from "@ayeastra/db";
import { defineJob } from "@ayeastra/jobs";

import { startDiscovery } from "../seam";

/**
 * context.enrich (context doc) — post-onboarding enrichment: every watched
 * entity without a source map gets source.discover kicked on the CF side,
 * and market entities get their keyword feeds minted from the marketWatch
 * slice. Idempotent — re-runs only fill gaps.
 */

export const contextEnrich = defineJob({
  name: "context.enrich",
  payload: z.object({ orgId: z.string().min(1) }),
  idempotencyKey: (p) => `enrich:${p.orgId}:${new Date().toISOString().slice(0, 10)}`,
  run: async (payload) => {
    const db = getDb();
    const scoped = scopedDb(payload.orgId, db);
    const context = await currentContext(scoped);
    if (!context) return;

    const watched = (await scoped.select(orgEntities)).filter((w) => w.archivedAt === null);
    if (watched.length === 0) return;
    const entityRows = await db
      .select()
      .from(entities)
      .where(inArray(entities.id, watched.map((w) => w.entityId)));
    const byId = new Map(entityRows.map((e) => [e.id, e]));

    for (const watch of watched) {
      const entity = byId.get(watch.entityId);
      if (!entity) continue;

      const existing = await db
        .select({ id: sources.id })
        .from(sources)
        .where(eq(sources.entityId, entity.id))
        .limit(1);

      if (entity.type === "market") {
        // Category watches (2.1): keyword-query feeds, not site maps.
        const market = context.payload.marketWatch?.markets.find(
          (m) => m.name.toLowerCase() === entity.canonicalName.toLowerCase(),
        );
        const urls = marketFeedUrls(entity.canonicalName, market?.keywords ?? []);
        for (const url of urls) {
          await db
            .insert(sources)
            .values({ entityId: entity.id, url, kind: "keyword_feed", discovery: "auto" })
            .onConflictDoNothing();
        }
        continue;
      }

      if (existing.length === 0 && entity.domain) {
        await startDiscovery(entity.id);
      }
    }
  },
});
