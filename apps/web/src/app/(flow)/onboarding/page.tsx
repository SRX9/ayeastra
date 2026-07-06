import { getWorkOS } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

import { isLlmConfigured } from "@ayeastra/ai";
import { currentContext } from "@ayeastra/core";
import { scopedDb } from "@ayeastra/db";

import { requireAuth } from "@/lib/auth";
import { getOnboardingResume } from "@/lib/onboarding";

import { EMPTY_DRAFT, type OnboardingDraft, type StepId } from "./draft";
import { OnboardingWizard } from "./wizard";

/**
 * Full-screen onboarding: workspace creation → Intelligence Plan activation,
 * one stateful surface. Resume state lives in onboarding_state per org, so
 * this loader decides where the wizard opens; the client autosaves from there.
 */

const PERSONAL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
  "gmx.com",
  "pm.me",
]);

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function OnboardingPage() {
  const session = await requireAuth();

  const email = session.user.email;
  const emailDomain = email.split("@")[1]?.toLowerCase() ?? "";
  const isWorkEmail = emailDomain !== "" && !PERSONAL_DOMAINS.has(emailDomain);

  let orgName: string | null = null;
  let initialStep: StepId = "company";
  let initialDraft: OnboardingDraft = EMPTY_DRAFT;
  let resumed = false;

  if (session.organizationId) {
    // An activated plan means onboarding is over — the wizard never reopens
    // on top of live context (edits happen in /settings/context).
    const existing = await currentContext(scopedDb(session.organizationId));
    if (existing) redirect("/dashboard");

    const [organization, resume] = await Promise.all([
      getWorkOS().organizations.getOrganization(session.organizationId),
      getOnboardingResume(session.organizationId),
    ]);
    orgName = organization.name;

    if (resume) {
      initialStep = resume.step;
      initialDraft = resume.draft;
      resumed = true;
    }

    // Seed the obvious from what we already know — never over a saved draft.
    if (!initialDraft.companyName) {
      initialDraft = { ...initialDraft, companyName: organization.name };
    }
    if (!initialDraft.domain && isWorkEmail) {
      initialDraft = { ...initialDraft, domain: emailDomain };
    }
  }

  return (
    <OnboardingWizard
      email={email}
      firstName={session.user.firstName ?? null}
      orgName={orgName}
      suggestedOrgName={isWorkEmail ? titleCase(emailDomain.split(".")[0] ?? "") : ""}
      initialStep={initialStep}
      initialDraft={initialDraft}
      aiAvailable={isLlmConfigured()}
      resumed={resumed}
    />
  );
}
