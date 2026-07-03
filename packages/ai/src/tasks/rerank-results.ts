import { z } from "zod";

import { defineTask } from "../task";

/**
 * Ask pipeline stage 3 (ask doc): listwise rerank of hybrid-retrieval
 * candidates. The model orders; code cuts to top-N and never accepts ids it
 * didn't offer.
 */

export const RerankResultsInput = z.object({
  query: z.string().min(1),
  candidates: z
    .array(z.object({ id: z.string(), text: z.string() }))
    .min(1),
});

export const RerankResultsOutput = z.object({
  /** Candidate ids, most relevant first. Omit irrelevant ones. */
  ranked: z.array(z.string()),
});

export const rerankResults = defineTask({
  name: "rerank-results",
  tier: "small",
  input: RerankResultsInput,
  output: RerankResultsOutput,
  maxOutputTokens: 300,
  prompt: (input) => ({
    system: `You rerank retrieved intelligence items by relevance to the query.
Return candidate ids most-relevant-first. OMIT items that do not help answer the query — an empty list is valid when nothing is relevant.`,
    user: JSON.stringify(input),
  }),
  validate: (out, input) => {
    const known = new Set(input.candidates.map((c) => c.id));
    const seen = new Set<string>();
    const issues: string[] = [];
    for (const id of out.ranked) {
      if (!known.has(id)) issues.push(`ranked: unknown candidate id "${id}"`);
      if (seen.has(id)) issues.push(`ranked: duplicate id "${id}"`);
      seen.add(id);
    }
    return issues;
  },
});
