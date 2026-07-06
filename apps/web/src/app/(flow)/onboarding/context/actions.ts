"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { appendContextVersion, currentContext } from "@ayeastra/core";
import { scopedDb } from "@ayeastra/db";

import { requireOrg } from "@/lib/auth";
import { buildContextPayload, lines } from "@/lib/context-payload";
import { onContextUpdated, onPlanActivated } from "@/lib/trigger-jobs";

/**
 * Manual Intelligence Plan save: form → validated BusinessContext v(n+1).
 * Payload assembly is shared with the onboarding wizard (lib/context-payload)
 * — either path, signals stamp the version that scored them.
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

export async function saveContext(formData: FormData) {
  const session = await requireOrg();

  const parsed = Input.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const f = parsed.data;
  const now = new Date().toISOString();
  const scoped = scopedDb(session.organizationId);
  const existing = await currentContext(scoped);

  const payload = buildContextPayload(
    {
      companyName: f.companyName,
      domain: f.domain,
      oneLiner: f.oneLiner,
      stage: f.stage,
      market: f.market,
      positioning: f.positioning,
      differentiators: lines(f.differentiators),
      pricingPosture: f.pricingPosture,
      segments: lines(f.segments),
      priorities: lines(f.priorities),
      briefingDay: f.briefingDay,
      timezone: f.timezone,
    },
    existing,
    session.user.email,
    now,
  );

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
