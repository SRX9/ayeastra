"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { marketFeedUrls } from "@ayeastra/collection/discovery";
import {
  appendContextVersion,
  currentContext,
  resolveEntity,
  type BusinessContext,
} from "@ayeastra/core";
import { getDb, orgEntities, scopedDb, sources } from "@ayeastra/db";
import { activeModuleKeys } from "@ayeastra/modules";

import { requireRole } from "@/lib/auth";
import { listOrgModules } from "@/lib/modules";

/**
 * Product & Market Watch activation slice (2.1 acceptance: activating on an
 * existing org takes < 10 min — ITS onboarding slice only). One submit:
 * marketWatch context slice appended as a new version, market entities
 * resolved into the shared graph, keyword feeds registered for collection.
 */

const SliceInput = z.object({
  markets: z.string().trim().min(1),
  keywords: z.string().trim(),
  platforms: z.string().trim(),
});

const splitLines = (s: string) =>
  s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

export async function saveMarketWatchSlice(formData: FormData) {
  const session = await requireRole("admin");
  if ("error" in session) return;

  // The slice only applies when the module is actually active for this org.
  const active = activeModuleKeys(await listOrgModules(session.organizationId));
  if (!active.includes("product_market_watch")) return;

  const parsed = SliceInput.safeParse({
    markets: formData.get("markets"),
    keywords: formData.get("keywords"),
    platforms: formData.get("platforms"),
  });
  if (!parsed.success) return;

  const marketNames = splitLines(parsed.data.markets);
  const keywords = splitLines(parsed.data.keywords);
  const platforms = splitLines(parsed.data.platforms);
  if (marketNames.length === 0) return;

  const scoped = scopedDb(session.organizationId);
  const context = await currentContext(scoped);
  if (!context) return; // module rides the existing context — never replaces onboarding

  const payload: BusinessContext = {
    ...context.payload,
    marketWatch: {
      markets: marketNames.map((name) => ({ name, keywords })),
      platforms,
    },
  };
  await appendContextVersion(scoped, payload, session.user.id);

  // Market entities live in the SAME entity graph; their sources are
  // keyword-query feeds (kind: keyword_feed) instead of site maps.
  const db = getDb();
  for (const name of marketNames) {
    const { entityId } = await resolveEntity({ name, type: "market", db });
    await scoped
      .insert(orgEntities, { entityId, role: "market" as const, tier: "watch" as const })
      .onConflictDoNothing();
    for (const url of marketFeedUrls(name, keywords)) {
      await db
        .insert(sources)
        .values({ entityId, url, kind: "keyword_feed", discovery: "user" })
        .onConflictDoNothing({ target: sources.url });
    }
  }

  revalidatePath("/settings/modules");
}
