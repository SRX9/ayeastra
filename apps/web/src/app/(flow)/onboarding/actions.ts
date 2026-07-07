"use server";

import { lookup } from "node:dns/promises";

import { getWorkOS, switchToOrganization } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { z } from "zod";

import { isLlmConfigured, prefillContext, PrefillContextOutput } from "@ayeastra/ai";
import { appendContextVersion, currentContext } from "@ayeastra/core";
import { scopedDb } from "@ayeastra/db";

import { requireAuth, requireOrg } from "@/lib/auth";
import { buildContextPayload } from "@/lib/context-payload";
import { clearOnboardingResume, saveOnboardingResume } from "@/lib/onboarding";
import { DEFAULT_PLAN, DEFAULT_SEAT_LIMIT } from "@/lib/team";
import { onContextUpdated, onPlanActivated } from "@/lib/trigger-jobs";

import {
  DOMAIN_RE,
  isValidTimezone,
  normalizeDomain,
  OnboardingDraft,
  STEP_IDS,
  stepErrors,
  type StepId,
} from "./draft";

/* ------------------------------------------------------------------ */
/* Step 1 — workspace                                                  */
/* ------------------------------------------------------------------ */

const orgSchema = z.object({ name: z.string().trim().min(2).max(64) });

export interface CreateWorkspaceState {
  error?: string;
}

export async function createWorkspaceAction(
  _prev: CreateWorkspaceState,
  formData: FormData,
): Promise<CreateWorkspaceState> {
  const session = await requireAuth();
  if (session.organizationId) redirect("/onboarding");

  const workos = getWorkOS();

  // Already a member somewhere (e.g. accepted an invite elsewhere)? Join that
  // org instead of creating a duplicate — one org per user at launch.
  const existing = await workos.userManagement.listOrganizationMemberships({
    userId: session.user.id,
    statuses: ["active"],
    limit: 1,
  });
  const membership = existing.data[0];
  if (membership) {
    await switchToOrganization(membership.organizationId);
    redirect("/dashboard");
  }

  const parsed = orgSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: "Workspace name must be between 2 and 64 characters." };
  }

  let organizationId: string;
  try {
    const organization = await workos.organizations.createOrganization({
      name: parsed.data.name,
      metadata: { plan: DEFAULT_PLAN, seatLimit: String(DEFAULT_SEAT_LIMIT) },
    });
    organizationId = organization.id;
    try {
      await workos.userManagement.createOrganizationMembership({
        organizationId: organization.id,
        userId: session.user.id,
        roleSlug: "admin",
      });
    } catch (error) {
      // Don't leave an org nobody belongs to.
      await workos.organizations.deleteOrganization(organization.id).catch(() => {});
      throw error;
    }
  } catch (error) {
    console.error("[onboarding] failed to create organization", error);
    return {
      error:
        "Could not create the workspace. Make sure the 'admin' role exists in your WorkOS environment (see documentation/auth.md).",
    };
  }

  await switchToOrganization(organizationId);
  // Back into the wizard — the next step (Company) picks up the new org.
  redirect("/onboarding");
}

/* ------------------------------------------------------------------ */
/* Autosave                                                            */
/* ------------------------------------------------------------------ */

export async function saveDraftAction(
  step: StepId,
  draft: unknown,
): Promise<{ ok: boolean }> {
  const session = await requireOrg();
  const parsed = OnboardingDraft.safeParse(draft);
  if (!parsed.success || !(STEP_IDS as readonly string[]).includes(step)) {
    return { ok: false };
  }
  try {
    await saveOnboardingResume(session.organizationId, session.user.id, step, parsed.data);
    return { ok: true };
  } catch (error) {
    console.error("[onboarding] draft autosave failed", error);
    return { ok: false };
  }
}

/* ------------------------------------------------------------------ */
/* AI prefill                                                          */
/* ------------------------------------------------------------------ */

export type PrefillData = z.output<typeof PrefillContextOutput>;

export type PrefillResult =
  | { ok: true; data: PrefillData; fromHomepage: boolean }
  | { ok: false; reason: "unavailable" | "bad-domain" | "failed" };

export async function prefillAction(input: {
  companyName: string;
  domain: string;
}): Promise<PrefillResult> {
  const session = await requireOrg();
  if (!isLlmConfigured()) return { ok: false, reason: "unavailable" };

  const domain = normalizeDomain(String(input.domain ?? ""));
  const companyName = String(input.companyName ?? "").slice(0, 200) || domain;
  if (!DOMAIN_RE.test(domain)) return { ok: false, reason: "bad-domain" };

  const homepageText = await fetchHomepageText(domain);
  try {
    const data = await prefillContext.run(
      { companyName, domain, homepageText },
      { orgId: session.organizationId },
    );
    return { ok: true, data, fromHomepage: homepageText !== null };
  } catch (error) {
    console.error("[onboarding] prefill failed", error);
    return { ok: false, reason: "failed" };
  }
}

/** Private/reserved ranges a user-supplied hostname must never reach. */
function isPrivateIp(address: string, family: number): boolean {
  if (family === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b! >= 64 && b! <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b! >= 16 && b! <= 31) ||
      (a === 192 && b === 168)
    );
  }
  const lower = address.toLowerCase();
  return (
    lower === "::" ||
    lower === "::1" ||
    lower.startsWith("fe8") || // link-local fe80::/10
    lower.startsWith("fc") || // unique-local fc00::/7
    lower.startsWith("fd") ||
    lower.startsWith("::ffff:") // IPv4-mapped — reject rather than re-parse
  );
}

/** DOMAIN_RE blocks IP literals, but a public NAME can still resolve to an
 * internal address — resolve first and refuse private/reserved ranges. */
async function resolvesPublicly(hostname: string): Promise<boolean> {
  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    return (
      addresses.length > 0 &&
      addresses.every((a) => !isPrivateIp(a.address, a.family))
    );
  } catch {
    return false;
  }
}

/**
 * Fetch and strip the homepage. Best effort — null on any failure, the task
 * then falls back to widely-known facts. Redirects are followed by hand so
 * every hop is re-validated against the public-hostname rule (no IPs, no
 * localhost, no names resolving to private ranges) — the domain is user input.
 */
async function fetchHomepageText(domain: string): Promise<string | null> {
  let url = `https://${domain}`;
  try {
    for (let hop = 0; hop < 4; hop++) {
      if (!(await resolvesPublicly(new URL(url).hostname))) return null;
      const res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(6000),
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; AyeAstra-Onboarding/1.0)",
          accept: "text/html",
        },
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return null;
        const next = new URL(location, url);
        if (next.protocol !== "https:" || !DOMAIN_RE.test(next.hostname)) return null;
        url = next.href;
        continue;
      }
      if (!res.ok) return null;
      const html = (await res.text()).slice(0, 500_000);
      return htmlToText(html);
    }
    return null;
  } catch {
    return null;
  }
}

function htmlToText(html: string): string | null {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "";
  const description =
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html)?.[1] ??
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i.exec(html)?.[1] ??
    "";
  const body = html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  const text = [title.trim(), description.trim(), body].filter(Boolean).join("\n").slice(0, 8000);
  return text.length >= 40 ? text : null;
}

/* ------------------------------------------------------------------ */
/* Activate                                                            */
/* ------------------------------------------------------------------ */

export type ActivateResult = { ok: true } | { ok: false; error: string };

export async function activateAction(rawDraft: unknown): Promise<ActivateResult> {
  const session = await requireOrg();

  const parsed = OnboardingDraft.safeParse(rawDraft);
  if (!parsed.success) return { ok: false, error: "The draft could not be read — try again." };
  const draft = { ...parsed.data, domain: normalizeDomain(parsed.data.domain) };

  // Server-side re-check of every step; the client mirrors these rules.
  for (const step of ["company", "positioning", "focus", "delivery"] as const) {
    const errors = stepErrors(step, draft);
    const first = Object.values(errors)[0];
    if (first) return { ok: false, error: first };
  }
  if (!isValidTimezone(draft.timezone)) {
    return { ok: false, error: "Use an IANA timezone like America/New_York." };
  }

  const scoped = scopedDb(session.organizationId);
  const existing = await currentContext(scoped);
  const now = new Date().toISOString();

  const payload = buildContextPayload(
    {
      companyName: draft.companyName.trim(),
      domain: draft.domain,
      oneLiner: draft.oneLiner.trim(),
      stage: draft.stage.trim(),
      market: draft.market.trim(),
      positioning: draft.positioning.trim(),
      differentiators: draft.differentiators,
      pricingPosture: draft.pricingPosture,
      segments: draft.segments,
      priorities: draft.priorities,
      briefingDay: draft.briefingDay,
      timezone: draft.timezone,
    },
    existing,
    session.user.email,
    now,
  );

  try {
    await appendContextVersion(scoped, payload, session.user.id);
    // First activation kicks the Baseline Dossier (<24h SLA) + source
    // discovery; later saves only re-run enrichment to fill source gaps.
    if (existing) {
      await onContextUpdated(session.organizationId);
    } else {
      await onPlanActivated(session.organizationId);
    }
    await clearOnboardingResume(session.organizationId).catch(() => {});
    return { ok: true };
  } catch (error) {
    console.error("[onboarding] activation failed", error);
    return { ok: false, error: "Activation failed on our side — nothing was lost, try again." };
  }
}
