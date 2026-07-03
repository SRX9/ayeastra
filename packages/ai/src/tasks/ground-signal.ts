import { z } from "zod";

import { confidence } from "@ayeastra/db";

import { validateCitations } from "../evidence";
import { ANALYST_TONE, CONFIDENCE_RUBRIC } from "../rubrics";
import { defineTask } from "../task";

/**
 * The heart of the product (scoring doc): change facts + THIS org's context
 * → relevance and attachments. The model judges; severity math happens in
 * code (@ayeastra/scoring). Empty attachments = honest "context-neutral",
 * which code caps at NOTABLE.
 */

export const GroundSignalInput = z.object({
  entityName: z.string(),
  changeSummary: z.string(),
  facts: z.array(z.object({ ref: z.string(), text: z.string() })),
  context: z.object({
    positioning: z.object({
      statement: z.string(),
      differentiators: z.array(z.string()),
      pricingPosture: z.enum(["premium", "value", "parity"]),
      talkTracks: z.array(z.string()),
    }),
    segments: z.array(z.object({ name: z.string(), priority: z.number() })),
    priorities: z.array(z.object({ id: z.string(), text: z.string(), rank: z.number() })),
  }),
});

export const GroundSignalOutput = z.object({
  relevance: z.number().min(0).max(100),
  attachedPriorities: z.array(z.object({ priorityId: z.string(), how: z.string() })),
  attachedSegments: z.array(z.object({ segment: z.string(), how: z.string() })),
  positioningImpact: z.object({
    affected: z.boolean(),
    talkTrackAtRisk: z.string().nullable(),
    how: z.string().nullable(),
  }),
  whyItMatters: z.string(),
  /** F-refs backing whyItMatters — mechanically validated below. */
  refs: z.array(z.string()).min(1),
  recommendedAction: z.string(),
  confidence: z.enum(confidence.enumValues),
  confidenceNotes: z.string().min(1),
});

export const groundSignal = defineTask({
  name: "ground-signal",
  tier: "medium",
  input: GroundSignalInput,
  output: GroundSignalOutput,
  prompt: (input) => ({
    system: `You assess what a competitor change means for ONE specific business, grounded in its context.
${ANALYST_TONE}
${CONFIDENCE_RUBRIC}
Rules:
- Attach priorities/segments ONLY where the causal link is real; an empty list is the honest answer for context-neutral changes.
- attachedPriorities[].priorityId must be one of the provided priority ids.
- recommendedAction is concrete and owned ("update the PayBridge battlecard"), not generic advice.
- confidenceNotes states what new evidence would change this assessment.
- refs lists the F-refs your whyItMatters relies on.`,
    user: JSON.stringify(input),
  }),
  validate: (out, input) => {
    const issues = validateCitations(
      { facts: input.facts.map((f) => ({ ...f, evidenceId: "" })) },
      [{ label: "whyItMatters", refs: out.refs }],
    );
    const knownPriorities = new Set(input.context.priorities.map((p) => p.id));
    for (const a of out.attachedPriorities) {
      if (!knownPriorities.has(a.priorityId)) {
        issues.push(
          `attachedPriorities: unknown priorityId "${a.priorityId}" — use only provided ids or omit`,
        );
      }
    }
    return issues;
  },
});
