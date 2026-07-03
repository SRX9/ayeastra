import { z } from "zod";

import { defineTask } from "../task";

/**
 * Interview extraction (context doc): one call per user turn; a rambling
 * answer may fill ANY slice, not just the current stage's. Competitors come
 * out as names — entity resolution happens in code afterwards.
 */

export const ExtractContextSliceInput = z.object({
  stage: z.enum(["company", "competitors", "positioning", "priorities", "delivery"]),
  utterance: z.string().min(1),
});

export const ExtractContextSliceOutput = z.object({
  company: z
    .object({
      name: z.string(),
      domain: z.string(),
      oneLiner: z.string(),
      stage: z.string(),
      market: z.string(),
    })
    .partial()
    .nullable(),
  positioning: z
    .object({
      statement: z.string(),
      differentiators: z.array(z.string()),
      pricingPosture: z.enum(["premium", "value", "parity"]),
      talkTracks: z.array(z.string()),
    })
    .partial()
    .nullable(),
  segments: z
    .array(z.object({ name: z.string(), description: z.string() }))
    .nullable(),
  competitorNames: z
    .array(
      z.object({
        name: z.string(),
        tier: z.enum(["primary", "secondary", "watch"]).nullable(),
      }),
    )
    .nullable(),
  priorities: z.array(z.object({ text: z.string(), rank: z.number() })).nullable(),
  concerns: z.array(z.string()).nullable(),
  delivery: z
    .object({
      briefingDay: z.enum(["monday", "tuesday", "wednesday", "thursday", "friday"]),
      timezone: z.string(),
    })
    .partial()
    .nullable(),
});

export const extractContextSlice = defineTask({
  name: "extract-context-slice",
  tier: "small",
  input: ExtractContextSliceInput,
  output: ExtractContextSliceOutput,
  prompt: (input) => ({
    system: `You extract structured business context from one onboarding-interview answer.
Current stage: ${input.stage} — but capture EVERYTHING the answer contains, whatever slice it belongs to.
Extract only what is stated or directly implied; null for slices the answer says nothing about. Never invent.`,
    user: input.utterance,
  }),
});
