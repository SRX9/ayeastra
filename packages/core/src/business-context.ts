import { z } from "zod";

/**
 * BusinessContext — moat #2 (context doc). The payload of the append-only
 * business_context table; every signal and briefing stamps the version that
 * scored it, so "why was this HIGH in March?" is always answerable.
 * The interview and the manual Settings forms both produce exactly this.
 */

export const CompanySlice = z.object({
  name: z.string(),
  domain: z.string(),
  oneLiner: z.string(),
  stage: z.string(),
  market: z.string(),
});

export const PositioningSlice = z.object({
  statement: z.string(),
  differentiators: z.array(z.string()),
  pricingPosture: z.enum(["premium", "value", "parity"]),
  talkTracks: z.array(z.string()),
});

export const SegmentSlice = z.object({
  name: z.string(),
  description: z.string(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

export const CompetitorSlice = z.object({
  entityId: z.uuid(),
  tier: z.enum(["primary", "secondary", "watch"]),
  ourAdvantage: z.string().nullable(),
  theirAdvantage: z.string().nullable(),
  notes: z.string().nullable(),
});

export const PrioritySlice = z.object({
  id: z.string(),
  text: z.string(),
  rank: z.number().int().positive(),
  addedAt: z.iso.datetime(),
  status: z.enum(["active", "done", "dropped"]),
});

export const ConcernSlice = z.object({
  text: z.string(),
  addedAt: z.iso.datetime(),
});

export const DeliverySlice = z.object({
  briefingDay: z.enum([
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
  ]),
  timezone: z.string(),
  channels: z.object({
    email: z.array(z.email()),
    slackWebhook: z.string().nullable(),
  }),
  /** Channel names per severity, e.g. { critical: ["slack","email"], … }. */
  alertRouting: z.object({
    critical: z.array(z.enum(["slack", "email"])),
    high: z.array(z.enum(["slack", "email"])),
    notable: z.array(z.enum(["slack", "email"])),
  }),
});

/** Product & Market Watch onboarding slice (2.1) — written once when the
 * module activates; absent for orgs without the module. */
export const MarketWatchSlice = z.object({
  markets: z.array(z.object({ name: z.string(), keywords: z.array(z.string()) })),
  /** Platform ecosystems whose changelogs/policy pages matter (e.g. Salesforce). */
  platforms: z.array(z.string()),
});

export const BusinessContext = z.object({
  company: CompanySlice,
  positioning: PositioningSlice,
  segments: z.array(SegmentSlice),
  competitors: z.array(CompetitorSlice),
  priorities: z.array(PrioritySlice),
  concerns: z.array(ConcernSlice),
  delivery: DeliverySlice,
  marketWatch: MarketWatchSlice.optional(),
});

export type BusinessContext = z.output<typeof BusinessContext>;

/** Interview slices arrive incrementally — everything optional until Activate. */
export const BusinessContextDraft = BusinessContext.partial();
export type BusinessContextDraft = z.output<typeof BusinessContextDraft>;
