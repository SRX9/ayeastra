import { z } from "zod";

import { confidence } from "@ayeastra/db";

import { validateCitations } from "../evidence";
import { ANALYST_TONE, CONFIDENCE_RUBRIC } from "../rubrics";
import { defineTask } from "../task";

/**
 * Phase 3.1 — the fusion verifier. Deterministic machinery (groupers,
 * baselines, validated patterns) nominates a candidate; this heavy task
 * judges only whether the facts tell ONE coherent story and writes the
 * prose. It never computes statistics or track records — those arrive
 * pre-rendered in `stats`/`trackRecord` and are repeated verbatim. Rejection
 * persists nothing: one stretched correlation costs more trust than fifty
 * insights earn (risk #3).
 */

export const VerifyInsightInput = z.object({
  kind: z.enum(["correlation", "deviation", "pattern"]),
  entityName: z.string(),
  /** The rule/pattern claim under judgment. */
  hypothesis: z.string(),
  /** Deviation/pattern kinds: deterministic stats line, e.g.
   * "9 changes in 28d vs 1.1 expected (p=0.0004, 3.3σ)". */
  stats: z.string().nullable(),
  /** Pattern kind: renderTrackRecord() output — narrated, never computed. */
  trackRecord: z.string().nullable(),
  facts: z.array(z.object({ ref: z.string(), text: z.string() })),
  context: z.object({
    positioning: z.string(),
    priorities: z.array(z.object({ id: z.string(), text: z.string() })),
  }),
});

export const VerifyInsightOutput = z.object({
  /** false = no insight, nothing persists. Rejection is success. */
  isRealPattern: z.boolean(),
  rejectionReason: z.string().nullable(),
  /** One-line pattern statement → insights.pattern. */
  pattern: z.string(),
  analysis: z.string(),
  /** F-refs backing the analysis — mechanically validated below. */
  refs: z.array(z.string()),
  forwardLook: z.string().nullable(),
  recommendedActions: z
    .array(z.object({ description: z.string(), ownerRole: z.string() }))
    .max(2),
  confidence: z.enum(confidence.enumValues),
  /** "What would change this assessment" — honesty law #5, mandatory. */
  confidenceNotes: z.string().min(1),
});

export const verifyInsight = defineTask({
  name: "verify-insight",
  tier: "heavy",
  input: VerifyInsightInput,
  output: VerifyInsightOutput,
  prompt: (input) => ({
    system: `You are the verifier for cross-signal fusion insights. Deterministic rules nominated this candidate; you decide whether the facts tell ONE coherent story about ${input.entityName}.
${ANALYST_TONE}
${CONFIDENCE_RUBRIC}
Rules:
- REJECT (isRealPattern=false, with rejectionReason) unless the facts form a single coherent narrative. Temporal adjacency alone is coincidence, not a pattern. Rejection is success, not failure.
- Never invent numbers. Any figures in your prose must appear in the facts, stats, or trackRecord fields; repeat stats and trackRecord verbatim where cited.
- forwardLook only when the evidence genuinely supports a forward claim; hedge it with your stated confidence. For pattern kind, ground it in the track record's lead times.
- analysis explains WHY the combination matters for this business (see context); refs lists the F-refs it relies on.
- recommendedActions are concrete and owned, at most two.
- confidenceNotes states what new evidence would change this assessment.`,
    user: JSON.stringify(input),
  }),
  validate: (out, input) => {
    // Rejection is the cheap honest path — nothing persists, nothing to check.
    if (!out.isRealPattern) return [];
    const issues = validateCitations(
      { facts: input.facts.map((f) => ({ ...f, evidenceId: "" })) },
      [{ label: "analysis", refs: out.refs }],
    );
    // A one-fact correlation is definitionally stretched.
    if (input.kind === "correlation" && new Set(out.refs).size < 2) {
      issues.push(
        "analysis: a correlation insight must cite at least 2 distinct facts",
      );
    }
    return issues;
  },
});
