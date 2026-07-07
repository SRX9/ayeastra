import { tool } from "ai";
import { inArray } from "drizzle-orm";
import { z } from "zod";

import { currentContext } from "@ayeastra/core/context-store";
import { entities, getDb } from "@ayeastra/db";

import type { AstraSource } from "../registry";

/**
 * BusinessContext source — structured lookup, no retrieval: the payload is a
 * small versioned jsonb doc. Competitor entityIds are resolved to names so
 * the model never has to echo raw uuids at the user.
 */

const Section = z.enum([
  "company",
  "positioning",
  "segments",
  "competitors",
  "priorities",
  "concerns",
  "delivery",
  "marketWatch",
]);

export const businessContextSource: AstraSource = {
  key: "business-context",
  title: "Business context",
  description:
    "The org's own strategy document — company profile, positioning, segments, competitors, priorities, concerns, delivery preferences. Use for 'who are we / what do we care about' questions and to interpret intelligence through the org's lens.",

  async systemContext(ctx) {
    const current = await currentContext(ctx.scoped);
    if (!current) return null;
    const c = current.payload.company;
    return `The org's business: ${c.name} — ${c.oneLiner} (${c.stage}, ${c.market}).`;
  },

  tools(ctx) {
    return {
      business_context: tool({
        description:
          "Read the org's business context (versioned strategy doc). Pass a section for one slice, or omit for a compact summary of all slices.",
        inputSchema: z.object({
          section: Section.optional().describe(
            "One slice; omit for a summary of everything.",
          ),
        }),
        execute: async ({ section }) => {
          const current = await currentContext(ctx.scoped);
          if (!current) {
            return {
              status: "not_set_up",
              note: "No business context yet — the user completes it during onboarding or under Settings → Context.",
            };
          }
          const payload = current.payload;

          // Resolve competitor entity ids to names once, for either shape.
          const competitorIds = payload.competitors.map((c) => c.entityId);
          const names =
            competitorIds.length > 0
              ? await getDb()
                  .select({ id: entities.id, name: entities.canonicalName })
                  .from(entities)
                  .where(inArray(entities.id, competitorIds))
              : [];
          const nameById = new Map(names.map((n) => [n.id, n.name]));
          const competitors = payload.competitors.map((c) => ({
            name: nameById.get(c.entityId) ?? "unknown",
            tier: c.tier,
            ourAdvantage: c.ourAdvantage,
            theirAdvantage: c.theirAdvantage,
            notes: c.notes,
          }));

          const full = { ...payload, competitors };
          if (section) {
            return { version: current.version, [section]: full[section] ?? null };
          }
          return {
            version: current.version,
            updatedAt: current.createdAt.toISOString().slice(0, 10),
            company: full.company,
            positioning: full.positioning,
            segments: full.segments,
            competitors,
            priorities: full.priorities.filter((p) => p.status === "active"),
            concerns: full.concerns,
            delivery: full.delivery,
            marketWatch: full.marketWatch ?? null,
          };
        },
      }),
    };
  },
};
