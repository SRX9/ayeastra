import { z } from "zod";

import { signalCategory } from "@ayeastra/db";

import { defineTask } from "../task";

/**
 * Ask pipeline stage 1 (ask doc): natural-language query → retrieval filters.
 * The model resolves names/dates/pronouns; CODE decides refusal from scope +
 * retrieval scores afterwards (@ayeastra/ask). entityIds are validated
 * against the watched list — a hallucinated id cannot escape.
 */

export const ParseAskQueryInput = z.object({
  query: z.string().min(1),
  /** ISO date, so "last quarter" resolves deterministically in evals. */
  today: z.iso.date(),
  watchedEntities: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      aliases: z.array(z.string()),
    }),
  ),
  /** Prior turns, oldest first — lets follow-ups resolve "their hiring". */
  thread: z.array(z.string()),
});

export const ParseAskQueryOutput = z.object({
  /** internal_data / unrelated → refusal path, decided in code. */
  scope: z.enum(["external_intel", "internal_data", "unrelated"]),
  /** Watched entities the query targets (empty = all watched). */
  entityIds: z.array(z.string()),
  /** Companies asked about but not watched → coverage offer. */
  unmatchedMentions: z.array(z.string()),
  from: z.iso.date().nullable(),
  to: z.iso.date().nullable(),
  categories: z.array(z.enum(signalCategory.enumValues)),
  intent: z.enum(["lookup", "summary", "comparison", "timeline"]),
  /** Self-contained restatement (pronouns resolved from thread). */
  rewrittenQuery: z.string().min(1),
});

export const parseAskQuery = defineTask({
  name: "parse-ask-query",
  tier: "small",
  input: ParseAskQueryInput,
  output: ParseAskQueryOutput,
  maxOutputTokens: 400,
  prompt: (input) => ({
    system: `You parse questions to a competitive-intelligence archive into retrieval filters.
Rules:
- scope: external_intel = about watched/unwatched companies or markets; internal_data = asker's own metrics (churn, revenue, roadmap); unrelated = neither.
- entityIds: ids from watchedEntities the question targets (match names AND aliases; pronouns resolve from the thread). Empty means "all watched".
- unmatchedMentions: company names asked about that are NOT in watchedEntities.
- from/to: ISO dates resolved relative to today ("last 30 days", "Q1"); null when unbounded.
- categories: only when the question clearly narrows (e.g. "pricing moves"); otherwise empty.
- rewrittenQuery: the question restated self-contained, no pronouns.`,
    user: JSON.stringify(input),
  }),
  validate: (out, input) => {
    const issues: string[] = [];
    const known = new Set(input.watchedEntities.map((e) => e.id));
    for (const id of out.entityIds) {
      if (!known.has(id)) {
        issues.push(`entityIds: "${id}" is not a watched entity id`);
      }
    }
    if (out.from && out.to && out.from > out.to) {
      issues.push(`from (${out.from}) is after to (${out.to})`);
    }
    return issues;
  },
});
