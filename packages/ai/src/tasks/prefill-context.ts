import { z } from "zod";

import { defineTask } from "../task";

/**
 * Onboarding prefill: one call per "Prefill from your website" press. Drafts
 * Intelligence Plan fields from the company's homepage text (plus widely
 * known facts about well-known companies). Everything it returns lands in
 * editable wizard fields badged as AI-drafted — the user reviews before
 * Activate, so suggestions are allowed, inventions are not.
 */

export const PrefillContextInput = z.object({
  companyName: z.string().min(1),
  domain: z.string().min(1),
  /** Stripped homepage text, or null when the fetch failed. */
  homepageText: z.string().nullable(),
});

export const PrefillContextOutput = z.object({
  /** One sentence, plain words, no marketing gloss. */
  oneLiner: z.string().nullable(),
  /** e.g. "seed", "growth", "public" — null unless stated or widely known. */
  stage: z.string().nullable(),
  /** Market category in the company's own vocabulary. */
  market: z.string().nullable(),
  /** Positioning statement: how they claim to win. */
  positioning: z.string().nullable(),
  differentiators: z.array(z.string()).nullable(),
  pricingPosture: z.enum(["premium", "value", "parity"]).nullable(),
  /** Target customer segments, most emphasized first. */
  segments: z.array(z.string()).nullable(),
  /** Plausible strategic priorities implied by the site (launches, motions). */
  priorities: z.array(z.string()).nullable(),
});

export const prefillContext = defineTask({
  name: "prefill-context",
  tier: "medium",
  input: PrefillContextInput,
  output: PrefillContextOutput,
  prompt: (input) => ({
    system: `You draft onboarding fields for a competitive-intelligence product from a company's homepage.
Ground every field in the provided text or in widely known facts about this specific company; return null for anything you cannot ground — null is always better than a plausible-sounding guess.
Write tersely in the company's own vocabulary: oneLiner is a single plain sentence; differentiators/segments/priorities are short phrases (max 6 each); positioning is 1-2 sentences on how they claim to win.
pricingPosture: "premium" (wins on value), "value" (wins on price), or "parity" — null if the site gives no pricing signal.`,
    user: [
      `Company: ${input.companyName}`,
      `Domain: ${input.domain}`,
      input.homepageText
        ? `Homepage text:\n${input.homepageText}`
        : "Homepage text: (unavailable — use only widely known facts about this company, or null)",
    ].join("\n\n"),
  }),
});
