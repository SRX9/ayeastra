import { z } from "zod";

import { validateCitations } from "../evidence";
import { ANALYST_TONE, CONFIDENCE_RUBRIC } from "../rubrics";
import { defineTask } from "../task";

/**
 * Briefing synthesis (briefing doc step 3): one call per section over the
 * SELECTED signals' FactSheet — selection already happened in code
 * (@ayeastra/briefing). Entity memory is where "third pricing move this
 * quarter" comes from. Impact map and battlecard updates are NOT synthesized
 * — they're derived deterministically from priority_attachments/changelogs.
 */

export const BRIEF_SECTION_KEYS = [
  "top_moves",
  "pricing_packaging",
  "launches",
  "messaging",
  "recommended_actions",
] as const;

export const BriefSectionInput = z.object({
  sectionKey: z.enum(BRIEF_SECTION_KEYS),
  periodLabel: z.string(),
  /** Prompt-cache-stable across sections — keep field order fixed. */
  orgContext: z.object({
    positioningStatement: z.string(),
    priorities: z.array(z.object({ id: z.string(), text: z.string() })),
    segments: z.array(z.string()),
  }),
  facts: z.array(
    z.object({
      ref: z.string(),
      text: z.string(),
      entity: z.string(),
      date: z.iso.date().nullable(),
    }),
  ),
  /** Prior-period notes for the same entities (the memory advantage). */
  entityMemory: z.array(
    z.object({ entity: z.string(), note: z.string() }),
  ),
});

export const BriefSectionOutput = z.object({
  blocks: z
    .array(
      z.object({
        heading: z.string().nullable(),
        text: z.string().min(1),
        refs: z.array(z.string()).min(1),
        /** recommended_actions only: suggested owner role, else null. */
        ownerRole: z.string().nullable(),
      }),
    )
    .min(1),
});

const SECTION_GUIDANCE: Record<(typeof BRIEF_SECTION_KEYS)[number], string> = {
  top_moves:
    "The week's most consequential competitor moves, ranked as given. One block per move, heading = entity.",
  pricing_packaging:
    "Pricing and packaging changes. State exact before/after values from the facts — never compute or round.",
  launches: "Launches and changelog highlights. One block per launch.",
  messaging:
    "Messaging/positioning shifts, each contrasted against the org's own positioning statement.",
  recommended_actions:
    "Concrete owned actions ('update the PayBridge battlecard'), each tied to cited facts; set ownerRole (e.g. 'PMM', 'Sales enablement', 'Product').",
};

export const briefSection = defineTask({
  name: "brief-section",
  tier: "heavy",
  input: BriefSectionInput,
  output: BriefSectionOutput,
  prompt: (input) => ({
    system: `You write ONE section of a weekly competitive briefing for an executive reader.
${ANALYST_TONE}
${CONFIDENCE_RUBRIC}
Rules:
- Use ONLY the provided facts; every block cites its F-refs. A claim you cannot cite must be omitted.
- Weave in entityMemory where it adds pattern context ("third pricing move this quarter") — reference, never re-claim, memory as fact.
- Tie implications to the org's stated priorities/segments where the link is real; skip the tie-in otherwise.
- ownerRole: null except for recommended_actions blocks.
- Numbers appear exactly as written in facts.`,
    user: JSON.stringify({
      section: input.sectionKey,
      guidance: SECTION_GUIDANCE[input.sectionKey],
      period: input.periodLabel,
      orgContext: input.orgContext,
      facts: input.facts,
      entityMemory: input.entityMemory,
    }),
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
