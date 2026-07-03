import { z } from "zod";

import { confidence } from "@ayeastra/db";

import { validateCitations } from "../evidence";
import { ANALYST_TONE, CONFIDENCE_RUBRIC } from "../rubrics";
import { defineTask } from "../task";

/**
 * Ask pipeline stage 4 (ask doc): FactSheet → cited answer blocks. Same
 * citation validator as every synthesis task — an uncited claim cannot
 * render. Timeline intent → chronological blocks; comparison → per-entity.
 */

export const AnswerAskInput = z.object({
  question: z.string().min(1),
  intent: z.enum(["lookup", "summary", "comparison", "timeline"]),
  facts: z.array(
    z.object({
      ref: z.string(),
      text: z.string(),
      date: z.iso.date().nullable(),
      entity: z.string().nullable(),
    }),
  ),
});

export const AnswerAskOutput = z.object({
  blocks: z
    .array(
      z.object({
        /** Null for a single-block answer; entity or period otherwise. */
        heading: z.string().nullable(),
        text: z.string().min(1),
        refs: z.array(z.string()).min(1),
      }),
    )
    .min(1),
  confidence: z.enum(confidence.enumValues),
  /** What we did NOT have evidence for, if the question asked more. */
  gaps: z.string().nullable(),
});

export const answerAsk = defineTask({
  name: "answer-ask",
  tier: "heavy",
  input: AnswerAskInput,
  output: AnswerAskOutput,
  prompt: (input) => ({
    system: `You answer a question using ONLY the provided facts from a timestamped intelligence archive.
${ANALYST_TONE}
${CONFIDENCE_RUBRIC}
Rules:
- Every block cites the F-refs it relies on. A claim you cannot cite must be omitted.
- intent=timeline → blocks in chronological order, heading = period or date.
- intent=comparison → one block per entity, heading = entity name.
- gaps: state plainly what the question asked that the facts do not cover; null if fully covered.
- Never speculate beyond the facts; dates come from fact dates, not memory.`,
    user: JSON.stringify(input),
  }),
  validate: (out, input) =>
    validateCitations(
      { facts: input.facts.map((f) => ({ ref: f.ref, text: f.text, evidenceId: "" })) },
      out.blocks.map((b, i) => ({
        label: b.heading ?? `block ${i + 1}`,
        refs: b.refs,
      })),
    ),
});
