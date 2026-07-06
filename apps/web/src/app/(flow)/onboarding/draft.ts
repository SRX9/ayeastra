import { z } from "zod";

/**
 * Wizard vocabulary shared by client and server: the draft (raw form values,
 * NOT a BusinessContext), the step list, and per-step validation. The server
 * re-validates everything on Activate — client checks only gate navigation.
 */

export const STEP_IDS = ["company", "positioning", "focus", "delivery", "review"] as const;
export type StepId = (typeof STEP_IDS)[number];

export const STEPS: Array<{ id: StepId; label: string; title: string; description: string }> = [
  {
    id: "company",
    label: "Company",
    title: "Who are we watching for?",
    description:
      "The basics ground everything AyeAstra scores. Enter your domain and we can draft the rest from your website.",
  },
  {
    id: "positioning",
    label: "Positioning",
    title: "How do you win?",
    description:
      "Signals get scored against this — a competitor move only matters if it threatens how you claim to win.",
  },
  {
    id: "focus",
    label: "Focus",
    title: "What matters right now?",
    description:
      "Your target segments and ranked priorities decide what surfaces first in your briefings.",
  },
  {
    id: "delivery",
    label: "Delivery",
    title: "When should intelligence arrive?",
    description:
      "One weekly briefing, plus alerts when something can't wait. You can rewire this any time.",
  },
  {
    id: "review",
    label: "Activate",
    title: "Review your Intelligence Plan",
    description:
      "This becomes version 1 of your plan. Every future edit is a new version — history is never overwritten.",
  },
];

export const BRIEFING_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;

export const OnboardingDraft = z.object({
  companyName: z.string().max(200).default(""),
  domain: z.string().max(200).default(""),
  oneLiner: z.string().max(500).default(""),
  stage: z.string().max(100).default(""),
  market: z.string().max(200).default(""),
  positioning: z.string().max(2000).default(""),
  differentiators: z.array(z.string().max(300)).max(20).default([]),
  pricingPosture: z.enum(["premium", "value", "parity"]).default("premium"),
  segments: z.array(z.string().max(300)).max(20).default([]),
  priorities: z.array(z.string().max(300)).max(20).default([]),
  briefingDay: z.enum(BRIEFING_DAYS).default("monday"),
  timezone: z.string().max(100).default(""),
  /** Field keys the last AI prefill wrote and the user hasn't edited since. */
  aiFilled: z.array(z.string()).max(30).default([]),
});
export type OnboardingDraft = z.output<typeof OnboardingDraft>;

export const EMPTY_DRAFT: OnboardingDraft = OnboardingDraft.parse({});

/** Bare hostname like "acme.com" — rejects protocols, paths, IPs, ports. */
export const DOMAIN_RE = /^(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

export function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "");
}

/** Works in both runtimes — Intl throws on unknown IANA names. */
export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function stepErrors(
  step: StepId,
  draft: OnboardingDraft,
): Partial<Record<string, string>> {
  const errors: Partial<Record<string, string>> = {};
  if (step === "company") {
    if (draft.companyName.trim().length < 2) errors.companyName = "Give your company a name.";
    if (!DOMAIN_RE.test(normalizeDomain(draft.domain)))
      errors.domain = "Enter a bare domain like acme.com.";
    if (!draft.oneLiner.trim()) errors.oneLiner = "One sentence is enough.";
    if (!draft.stage.trim()) errors.stage = "Pick or type a stage.";
    if (!draft.market.trim()) errors.market = "Name the market you compete in.";
  }
  if (step === "positioning") {
    if (!draft.positioning.trim()) errors.positioning = "How do you want to win?";
  }
  if (step === "focus") {
    if (draft.segments.length === 0) errors.segments = "Add at least one segment.";
    if (draft.priorities.length === 0) errors.priorities = "Add at least one priority.";
  }
  if (step === "delivery") {
    if (!isValidTimezone(draft.timezone))
      errors.timezone = "Use an IANA timezone like America/New_York.";
  }
  return errors;
}

/** First step that still fails validation — where a resumed session lands. */
export function firstIncompleteStep(draft: OnboardingDraft): StepId {
  for (const step of STEP_IDS) {
    if (step === "review") return "review";
    if (Object.keys(stepErrors(step, draft)).length > 0) return step;
  }
  return "review";
}
