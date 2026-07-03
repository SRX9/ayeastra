import { z } from "zod";

import { ANALYST_TONE } from "../rubrics";
import { defineTask } from "../task";

/**
 * Product & Market Watch analysis agent (2.1): one keyword-feed/news item →
 * market category + extracted facts. The model classifies and extracts;
 * relevance gating, grounding, and severity stay in code downstream —
 * keyword feeds are noisy, so `relevant: false` is a first-class answer.
 */

export const AnalyzeMarketItemInput = z.object({
  marketName: z.string(),
  watchedKeywords: z.array(z.string()),
  itemTitle: z.string(),
  itemText: z.string(),
  itemUrl: z.string().nullable(),
  publishedAt: z.iso.date().nullable(),
});

export const MARKET_CATEGORIES = [
  "funding",
  "ma",
  "market_entry",
  "category_launch",
  "platform_shift",
  "narrative_shift",
] as const;

export const AnalyzeMarketItemOutput = z.object({
  /** False = not about this market or not a market event; item is skipped. */
  relevant: z.boolean(),
  category: z.enum([...MARKET_CATEGORIES, "other"]),
  /** Company/product/platform names the item is about (entity resolution input). */
  entitiesMentioned: z.array(z.string()),
  /** Verbatim-grounded facts; numbers only as they appear in the item. */
  facts: z.array(z.object({ label: z.string(), value: z.string() })),
  /** Org-agnostic one-liner for the changes row. */
  summary: z.string().max(300),
});

export const analyzeMarketItem = defineTask({
  name: "analyze-market-item",
  tier: "small",
  input: AnalyzeMarketItemInput,
  output: AnalyzeMarketItemOutput,
  maxOutputTokens: 500,
  prompt: (input) => ({
    system: `You analyze one news/feed item for a market-watch product tracking the "${input.marketName}" category.
${ANALYST_TONE}
Categories:
- funding: a company in the category raised money.
- ma: acquisition, merger, or acqui-hire in the category.
- market_entry: an established company entering the category, or a notable new entrant.
- category_launch: a product launch adjacent to or inside the category.
- platform_shift: a platform/ecosystem change (API, policy, marketplace) affecting the category.
- narrative_shift: analyst/press coverage reframing how the category is discussed.
Rules:
- relevant is false when the item is not about this category or is not a market event (opinion listicles, ads, duplicates) — that is the honest answer.
- facts hold label/value pairs quoted from the item (e.g. {"label":"amount raised","value":"$40M Series B"}); never compute, round, or infer numbers.
- summary is one factual sentence, no speculation about intent.`,
    user: JSON.stringify(input),
  }),
});
