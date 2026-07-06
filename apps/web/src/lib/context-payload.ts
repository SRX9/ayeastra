import type { BusinessContext, ContextVersion } from "@ayeastra/core";

/**
 * One assembler for every manual Intelligence Plan write — the onboarding
 * wizard and /settings/context both feed field values through here, so the
 * two paths can never drift in how they build a BusinessContext version.
 * Slices no form edits (competitors, talk tracks, marketWatch, …) are
 * preserved verbatim from the existing version.
 */

export interface ContextFields {
  companyName: string;
  domain: string;
  oneLiner: string;
  stage: string;
  market: string;
  positioning: string;
  differentiators: string[];
  pricingPosture: "premium" | "value" | "parity";
  segments: string[];
  priorities: string[];
  briefingDay: "monday" | "tuesday" | "wednesday" | "thursday" | "friday";
  timezone: string;
}

export function lines(v: string): string[] {
  const out: string[] = [];
  for (const raw of v.split("\n")) {
    const line = raw.trim();
    if (line) out.push(line);
  }
  return out;
}

/**
 * Priority ids are referenced by persisted data (signals.priorityAttachments,
 * missions.priorityId), so they must survive re-saves: a line whose text
 * matches an existing priority keeps its id and addedAt; only genuinely new
 * lines mint a new id. Positional `p{index}` ids would silently re-point every
 * stored attachment when a line is inserted or reordered.
 */
export function stablePriorities(
  texts: string[],
  previous: BusinessContext["priorities"],
  now: string,
): BusinessContext["priorities"] {
  const byText = new Map(previous.map((p) => [p.text, p]));
  let maxId = previous.reduce((max, p) => {
    const n = /^p(\d+)$/.exec(p.id);
    return n ? Math.max(max, Number(n[1])) : max;
  }, 0);
  return texts.map((text, i) => {
    const prev = byText.get(text);
    return {
      id: prev?.id ?? `p${++maxId}`,
      text,
      rank: i + 1,
      addedAt: prev?.addedAt ?? now,
      status: "active" as const,
    };
  });
}

export function buildContextPayload(
  f: ContextFields,
  existing: ContextVersion | null,
  userEmail: string,
  now: string,
): BusinessContext {
  return {
    company: {
      name: f.companyName,
      domain: f.domain,
      oneLiner: f.oneLiner,
      stage: f.stage,
      market: f.market,
    },
    positioning: {
      statement: f.positioning,
      differentiators: f.differentiators,
      pricingPosture: f.pricingPosture,
      talkTracks: existing?.payload.positioning.talkTracks ?? [],
    },
    segments: f.segments.map((name, i) => ({
      name,
      description: "",
      priority: Math.min(i + 1, 3) as 1 | 2 | 3,
    })),
    // Competitor slices are maintained by entity flows, not these forms.
    competitors: existing?.payload.competitors ?? [],
    priorities: stablePriorities(f.priorities, existing?.payload.priorities ?? [], now),
    concerns: existing?.payload.concerns ?? [],
    // Module onboarding slices (settings/modules) are preserved verbatim —
    // these forms don't edit them, so a re-save must never drop them.
    marketWatch: existing?.payload.marketWatch,
    delivery: {
      briefingDay: f.briefingDay,
      timezone: f.timezone,
      channels: {
        email: existing?.payload.delivery.channels.email ?? [userEmail],
        slackWebhook: existing?.payload.delivery.channels.slackWebhook ?? null,
      },
      alertRouting: existing?.payload.delivery.alertRouting ?? {
        critical: ["email"],
        high: ["email"],
        notable: [],
      },
    },
  };
}
