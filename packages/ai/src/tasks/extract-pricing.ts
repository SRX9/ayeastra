import { z } from "zod";

import { confidence } from "@ayeastra/db";

import { defineTask } from "../task";

/**
 * Diff-engine stage 3, pricing kind: markdown → PricingSnapshot. Runs on
 * BOTH the before and after snapshots; the structural comparison producing
 * exact deltas ("Pro.price: 499→399") happens in engine code, never here.
 * Low confidence output → engine degrades to diff-only (never wrong numbers).
 */

export const ExtractPricingInput = z.object({
  markdown: z.string().min(1),
});

const plan = z.object({
  name: z.string(),
  /** Numeric price when stated; null for "custom" / "contact us". */
  price: z.number().nullable(),
  /** Verbatim price text as shown on the page ("$499/mo", "Custom"). */
  priceText: z.string().nullable(),
  period: z.enum(["month", "year", "one_time", "usage", "unknown"]),
  features: z.array(z.string()),
  limits: z.array(z.string()),
});

export const ExtractPricingOutput = z.object({
  plans: z.array(plan),
  /** Extractor's own certainty; below-threshold → engine stores facts as null. */
  confidence: z.enum(confidence.enumValues),
});

export const extractPricing = defineTask({
  name: "extract-pricing",
  tier: "small",
  input: ExtractPricingInput,
  output: ExtractPricingOutput,
  prompt: (input) => ({
    system: `You extract pricing structure from a pricing page's markdown.
Rules:
- Extract ONLY what the page states. Never infer, convert currencies, or compute totals.
- price is the numeric amount exactly as shown (499 for "$499/mo"); null when not a number.
- priceText is the verbatim price string. features/limits are short verbatim phrases.
- confidence: high when the page is a clear plan table; moderate when structure is partially ambiguous; low when you are unsure the page is a pricing page or plans are unclear.`,
    user: input.markdown,
  }),
});
