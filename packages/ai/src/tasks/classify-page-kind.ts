import { z } from "zod";

import { confidence, sourceKind } from "@ayeastra/db";

import { defineTask } from "../task";

/**
 * Collection-engine discovery step 2: candidate URL + content → page kind.
 * Only confident classifications become sources rows; the rest are logged
 * for manual review during onboarding plan review.
 */

export const ClassifyPageKindInput = z.object({
  url: z.url(),
  title: z.string().nullable(),
  /** First ~2k chars of the page markdown — enough to identify the kind. */
  contentPreview: z.string(),
});

export const ClassifyPageKindOutput = z.object({
  kind: z.enum(sourceKind.enumValues),
  confidence: z.enum(confidence.enumValues),
});

export const classifyPageKind = defineTask({
  name: "classify-page-kind",
  tier: "small",
  input: ClassifyPageKindInput,
  output: ClassifyPageKindOutput,
  maxOutputTokens: 100,
  prompt: (input) => ({
    system: `You classify a company webpage into exactly one kind: ${sourceKind.enumValues.join(", ")}.
Judge by CONTENT, not URL alone (a /blog URL that is actually release notes is a changelog).
confidence: high only when the content clearly matches the kind; low when the preview is ambiguous or thin.`,
    user: JSON.stringify({
      url: input.url,
      title: input.title,
      content: input.contentPreview,
    }),
  }),
});
