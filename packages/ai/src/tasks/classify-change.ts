import { z } from "zod";

import { materiality, signalCategory, sourceKind } from "@ayeastra/db";

import { MATERIALITY_RUBRICS } from "../rubrics";
import { defineTask } from "../task";

/**
 * Diff-engine stage 2: changed blocks + source kind → materiality/category/
 * summary. Numeric force-promotion for pricing happens in engine code before
 * this runs (diff doc) — the model never gets to round a price change down.
 */

export const ClassifyChangeInput = z.object({
  sourceKind: z.enum(sourceKind.enumValues),
  addedBlocks: z.array(z.string()),
  removedBlocks: z.array(z.string()),
  modifiedBlocks: z.array(z.object({ before: z.string(), after: z.string() })),
});

export const ClassifyChangeOutput = z.object({
  materiality: z.enum(materiality.enumValues),
  category: z.enum(signalCategory.enumValues),
  /** Org-agnostic one-liner stored on the changes row. */
  summary: z.string().max(300),
});

export const classifyChange = defineTask({
  name: "classify-change",
  tier: "small",
  input: ClassifyChangeInput,
  output: ClassifyChangeOutput,
  maxOutputTokens: 300,
  prompt: (input) => ({
    system: `You classify detected webpage changes for a competitive-intelligence product.
Source kind: ${input.sourceKind}
Rubric: ${MATERIALITY_RUBRICS[input.sourceKind]}
Summarize factually in one sentence — no speculation about intent, no numbers that do not appear in the blocks.`,
    user: JSON.stringify({
      added: input.addedBlocks,
      removed: input.removedBlocks,
      modified: input.modifiedBlocks,
    }),
  }),
});
