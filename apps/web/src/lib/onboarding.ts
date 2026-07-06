import { getDb, onboardingState, scopedDb } from "@ayeastra/db";

import {
  EMPTY_DRAFT,
  OnboardingDraft,
  STEP_IDS,
  type StepId,
} from "@/app/(flow)/onboarding/draft";

/**
 * Wizard resume state: one row per org, upserted on autosave, deleted on
 * activation. Reads tolerate any stored shape — a draft written by an older
 * build parses through the schema's defaults instead of wedging onboarding.
 */

export interface OnboardingResume {
  step: StepId;
  draft: OnboardingDraft;
}

export async function getOnboardingResume(orgId: string): Promise<OnboardingResume | null> {
  const scoped = scopedDb(orgId);
  const [row] = await scoped.select(onboardingState);
  if (!row) return null;

  const parsed = OnboardingDraft.safeParse(row.draft);
  return {
    step: (STEP_IDS as readonly string[]).includes(row.step) ? (row.step as StepId) : "company",
    draft: parsed.success ? parsed.data : EMPTY_DRAFT,
  };
}

export async function saveOnboardingResume(
  orgId: string,
  userId: string,
  step: StepId,
  draft: OnboardingDraft,
): Promise<void> {
  await scopedDb(orgId)
    .insert(onboardingState, { step, draft, updatedBy: userId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: onboardingState.workosOrgId,
      set: { step, draft, updatedBy: userId, updatedAt: new Date() },
    });
}

export async function clearOnboardingResume(orgId: string): Promise<void> {
  // Sanctioned hand-built write: predicated on scope(), same as reads in
  // core/context-store — scopedDb has no delete helper.
  const scoped = scopedDb(orgId);
  await getDb().delete(onboardingState).where(scoped.scope(onboardingState));
}
