"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import {
  appendContextVersion,
  currentContext,
  type BusinessContext,
} from "@ayeastra/core";
import { scopedDb } from "@ayeastra/db";

import { requireOrg } from "@/lib/auth";
import { onContextUpdated, onPlanActivated } from "@/lib/trigger-jobs";

/**
 * Manual Intelligence Plan activation: form → validated BusinessContext v(n+1).
 * The AI interview (context.enrich) produces the same payload once LLM
 * credentials exist — either path, signals stamp the version that scored them.
 */

const Input = z.object({
  redirectTo: z.enum(["/dashboard", "/settings/context"]),
  companyName: z.string().min(1),
  domain: z.string().min(1),
  oneLiner: z.string().min(1),
  stage: z.string().min(1),
  market: z.string().min(1),
  positioning: z.string().min(1),
  differentiators: z.string().default(""),
  pricingPosture: z.enum(["premium", "value", "parity"]),
  segments: z.string().min(1),
  priorities: z.string().min(1),
  briefingDay: z.enum(["monday", "tuesday", "wednesday", "thursday", "friday"]),
  timezone: z.string().min(1),
});

function lines(v: string): string[] {
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
function stablePriorities(
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

export async function saveContext(formData: FormData) {
  const session = await requireOrg();

  const parsed = Input.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const f = parsed.data;
  const now = new Date().toISOString();
  const scoped = scopedDb(session.organizationId);
  const existing = await currentContext(scoped);

  const payload: BusinessContext = {
    company: {
      name: f.companyName,
      domain: f.domain,
      oneLiner: f.oneLiner,
      stage: f.stage,
      market: f.market,
    },
    positioning: {
      statement: f.positioning,
      differentiators: lines(f.differentiators),
      pricingPosture: f.pricingPosture,
      talkTracks: existing?.payload.positioning.talkTracks ?? [],
    },
    segments: lines(f.segments).map((name, i) => ({
      name,
      description: "",
      priority: (Math.min(i + 1, 3) as 1 | 2 | 3),
    })),
    // Competitor slices are maintained by entity flows, not this form.
    competitors: existing?.payload.competitors ?? [],
    priorities: stablePriorities(lines(f.priorities), existing?.payload.priorities ?? [], now),
    concerns: existing?.payload.concerns ?? [],
    // Module onboarding slices (settings/modules) are preserved verbatim —
    // this form doesn't edit them, so a re-save must never drop them.
    marketWatch: existing?.payload.marketWatch,
    delivery: {
      briefingDay: f.briefingDay,
      timezone: f.timezone,
      channels: {
        email: existing?.payload.delivery.channels.email ?? [session.user.email],
        slackWebhook: existing?.payload.delivery.channels.slackWebhook ?? null,
      },
      alertRouting: existing?.payload.delivery.alertRouting ?? {
        critical: ["email"],
        high: ["email"],
        notable: [],
      },
    },
  };

  await appendContextVersion(scoped, payload, session.user.id);
  // First activation kicks the Baseline Dossier (<24h SLA) + source
  // discovery; later saves only re-run enrichment to fill source gaps.
  if (existing) {
    await onContextUpdated(session.organizationId);
  } else {
    await onPlanActivated(session.organizationId);
  }
  redirect(f.redirectTo);
}
