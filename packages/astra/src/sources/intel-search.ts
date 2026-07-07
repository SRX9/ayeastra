import { tool } from "ai";
import { z } from "zod";

import { embed, rerankResults } from "@ayeastra/ai";
import {
  MIN_SUPPORTING_RESULTS,
  MIN_TOP_SIMILARITY,
  retrieveChangesByVector,
  retrieveSignalsByKeyword,
  retrieveSignalsByVector,
  rrfMerge,
  topSimilarity,
  type AskFilters,
} from "@ayeastra/ask";
import { signalCategory } from "@ayeastra/db";

import { listWatched, resolveEntityNames } from "../org";
import type { AstraSource } from "../registry";

/**
 * Intelligence archive search — the ask pipeline's retrieval stage as a
 * tool. The deterministic evidence gate is preserved verbatim: below the
 * refusal thresholds the tool returns a structured insufficient_evidence
 * status the model must relay honestly (the prompt's grounding law); it
 * physically has no results to cite. The tool schema replaces
 * parseAskQuery's filter extraction — the agent loop does the parsing.
 */

const TOP_N = 12;

export const intelSearchSource: AstraSource = {
  key: "intel-search",
  title: "Intelligence archive",
  description:
    "Hybrid search over the org's scored signals and detected competitor changes (vector + keyword). The ONLY source for intelligence claims — every result carries a citable id.",

  tools(ctx) {
    return {
      intel_search: tool({
        description:
          "Search the org's intelligence archive (signals + competitor changes). Use for any question about what watched companies did, changed, launched, priced, or announced. Returns citable results with ids like signal:<uuid> / change:<uuid>.",
        inputSchema: z.object({
          query: z
            .string()
            .min(2)
            .describe(
              "Self-contained search query — resolve pronouns from the conversation first.",
            ),
          entityNames: z
            .array(z.string())
            .optional()
            .describe("Company names to filter by, as the user said them."),
          categories: z
            .array(z.enum(signalCategory.enumValues))
            .optional()
            .describe("Signal categories to filter by."),
          from: z.string().optional().describe("ISO date lower bound."),
          to: z.string().optional().describe("ISO date upper bound."),
        }),
        execute: async ({ query, entityNames, categories, from, to }) => {
          const watched = await listWatched(ctx.scoped);
          const watchedNames = watched.map((w) => w.name);

          const filters: AskFilters = {
            categories: categories?.length ? categories : undefined,
            from: from ? new Date(from) : undefined,
            to: to ? new Date(to) : undefined,
          };
          let unmatched: string[] = [];
          if (entityNames?.length) {
            const resolved = resolveEntityNames(entityNames, watched);
            unmatched = resolved.unmatched;
            if (resolved.entityIds.length === 0) {
              // Every named company is unwatched — no evidence can exist.
              return {
                status: "unwatched" as const,
                unmatchedCompanies: unmatched,
                watchedCompanies: watchedNames,
              };
            }
            filters.entityIds = resolved.entityIds;
          }

          const orgId = ctx.scoped.orgId;
          const [queryEmbedding] = await embed([query], ctx.runCtx);
          const [vSignals, vChanges, kSignals] = await Promise.all([
            retrieveSignalsByVector(orgId, queryEmbedding!, filters),
            retrieveChangesByVector(orgId, queryEmbedding!, filters),
            retrieveSignalsByKeyword(orgId, query, filters),
          ]);
          const merged = rrfMerge([vSignals, vChanges, kSignals]);

          // Deterministic evidence gate — same thresholds as the ask doc.
          const top = topSimilarity([vSignals, vChanges]);
          if (
            top === null ||
            top < MIN_TOP_SIMILARITY ||
            merged.length < MIN_SUPPORTING_RESULTS
          ) {
            return {
              status: "insufficient_evidence" as const,
              watchedCompanies: watchedNames,
              ...(unmatched.length ? { unmatchedCompanies: unmatched } : {}),
            };
          }

          const reranked = await rerankResults.run(
            {
              query,
              candidates: merged.map((m) => ({ id: m.id, text: m.text })),
            },
            ctx.runCtx,
          );
          const byId = new Map(merged.map((m) => [m.id, m]));
          const nameById = new Map(watched.map((w) => [w.entityId, w.name]));
          const results = reranked.ranked
            .map((id) => byId.get(id))
            .filter((m) => m !== undefined)
            .slice(0, TOP_N)
            .map((m) => ({
              id: m.id,
              kind: m.kind,
              text: m.text,
              company: nameById.get(m.entityId) ?? null,
              date: m.date.toISOString().slice(0, 10),
            }));

          return {
            status: "ok" as const,
            results,
            ...(unmatched.length ? { unmatchedCompanies: unmatched } : {}),
          };
        },
      }),
    };
  },
};
