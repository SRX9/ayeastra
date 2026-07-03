"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import {
  appendContextVersion,
  currentContext,
  type BusinessContext,
} from "@ayeastra/core";
import { scopedDb } from "@ayeastra/db";

import { requireAuth } from "@/lib/auth";

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

export async function saveContext(formData: FormData) {
  const session = await requireAuth();
  if (!session.organizationId) redirect("/onboarding");

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
    priorities: lines(f.priorities).map((text, i) => ({
      id: `p${i + 1}`,
      text,
      rank: i + 1,
      addedAt: now,
      status: "active" as const,
    })),
    concerns: existing?.payload.concerns ?? [],
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
  redirect(f.redirectTo);
}
