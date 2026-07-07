import { tool } from "ai";
import { z } from "zod";

import { embed } from "@ayeastra/ai";

import { getKbArticle, listKbArticles, searchKb } from "../kb/retrieval";
import type { AstraSource } from "../registry";

/**
 * Platform KB source — curated user-facing product docs (packages/astra/kb),
 * embedded into the global kb_chunks index by the kb:seed script. The
 * "how does this platform work" half of Astra's brain.
 */

export const platformKbSource: AstraSource = {
  key: "platform-kb",
  title: "Platform guide",
  description:
    "Curated documentation about AyeAstra itself — every page, feature, concept (signals, severity, briefings, missions, evidence…), plus billing/team/onboarding. Use for any 'how does X work / where do I find Y' question.",

  tools(ctx) {
    return {
      kb_search: tool({
        description:
          "Search the platform guide for how AyeAstra works — features, pages, concepts, account/billing. Returns the most relevant doc passages.",
        inputSchema: z.object({
          query: z.string().min(2),
          category: z
            .enum(["features", "concepts", "account"])
            .optional()
            .describe("Optional filter: product features, core concepts, or account/billing."),
        }),
        execute: async ({ query, category }) => {
          const [embedding] = await embed([query], ctx.runCtx);
          const hits = await searchKb(embedding!, category);
          if (hits.length === 0) {
            const articles = await listKbArticles();
            return { status: "no_match" as const, availableArticles: articles };
          }
          return {
            status: "ok" as const,
            passages: hits.map((h) => ({
              article: h.articleSlug,
              title: h.articleTitle,
              heading: h.heading,
              content: h.content,
            })),
          };
        },
      }),

      kb_article: tool({
        description:
          "Fetch one full platform-guide article by slug (use after kb_search when the user wants the end-to-end explanation).",
        inputSchema: z.object({ slug: z.string() }),
        execute: async ({ slug }) => {
          const article = await getKbArticle(slug);
          if (!article) {
            const articles = await listKbArticles();
            return { status: "not_found" as const, availableArticles: articles };
          }
          return { status: "ok" as const, ...article };
        },
      }),
    };
  },
};
