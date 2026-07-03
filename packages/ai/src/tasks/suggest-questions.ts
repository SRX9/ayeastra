import { z } from "zod";

import { defineTask } from "../task";

/**
 * Ask empty-state (ask doc): suggested questions generated from the org's
 * recent signals — teaches the habit (Ask weekly repeat usage > 40% is a
 * PRD metric). Must only suggest what the archive can actually answer.
 */

export const SuggestQuestionsInput = z.object({
  recentSignals: z
    .array(z.object({ entity: z.string(), finding: z.string() }))
    .min(1),
});

export const SuggestQuestionsOutput = z.object({
  questions: z.array(z.string().min(8)).min(3).max(5),
});

export const suggestQuestions = defineTask({
  name: "suggest-questions",
  tier: "small",
  input: SuggestQuestionsInput,
  output: SuggestQuestionsOutput,
  maxOutputTokens: 300,
  prompt: (input) => ({
    system: `You write 3-5 short questions a user could ask their competitive-intelligence archive.
Rules:
- Base every question on the provided recent signals — never invent entities or topics not present.
- Questions the archive can answer (about competitors' moves), not internal questions.
- Vary the shape: one recap ("what has X done recently"), one specific, one comparison if 2+ entities appear.`,
    user: JSON.stringify(input),
  }),
});
