"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  actions,
  actionSourceType,
  feedback,
  feedbackTargetType,
  feedbackVerdict,
  orgScoringWeights,
  outcomes,
  scopedDb,
  signals,
  signalStatus,
} from "@ayeastra/db";
import { closeAction as closeDescriptor } from "@ayeastra/outcomes";
import {
  applyActionTaken,
  applyVerdict,
  DEFAULT_WEIGHT,
  type WeightState,
} from "@ayeastra/scoring";

import { requireAuth } from "@/lib/auth";

/** Signal quick actions + feedback (web-app doc §Dashboard). Feedback is
 * the scoring engine's learning input — write path must be trivial. */

const StatusInput = z.object({
  signalId: z.uuid(),
  status: z.enum(signalStatus.enumValues),
});

export async function updateSignalStatus(formData: FormData) {
  const session = await requireAuth();
  if (!session.organizationId) return;
  const parsed = StatusInput.safeParse({
    signalId: formData.get("signalId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return;

  const scoped = scopedDb(session.organizationId);
  await scoped.update(
    signals,
    {
      status: parsed.data.status,
      snoozedUntil:
        parsed.data.status === "snoozed"
          ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          : null,
    },
    eq(signals.id, parsed.data.signalId),
  );
  revalidatePath("/dashboard");
}

const FeedbackInput = z.object({
  targetType: z.enum(feedbackTargetType.enumValues),
  targetId: z.string().min(1),
  verdict: z.enum(feedbackVerdict.enumValues),
});

/** Upsert one (entity × category) weight cell to the transitioned state. */
async function writeWeight(
  scoped: ReturnType<typeof scopedDb>,
  entityId: string,
  category: (typeof signals.$inferSelect)["category"],
  next: WeightState,
) {
  await scoped
    .insert(orgScoringWeights, {
      entityId,
      category,
      multiplier: next.multiplier,
      consecutiveNegative: next.consecutiveNegative,
    })
    .onConflictDoUpdate({
      target: [
        orgScoringWeights.workosOrgId,
        orgScoringWeights.entityId,
        orgScoringWeights.category,
      ],
      set: {
        multiplier: next.multiplier,
        consecutiveNegative: next.consecutiveNegative,
        updatedAt: new Date(),
      },
    });
}

export async function submitFeedback(formData: FormData) {
  const session = await requireAuth();
  if (!session.organizationId) return;
  const parsed = FeedbackInput.safeParse({
    targetType: formData.get("targetType"),
    targetId: formData.get("targetId"),
    verdict: formData.get("verdict"),
  });
  if (!parsed.success) return;

  const scoped = scopedDb(session.organizationId);
  // One row per (user × target): a repeat vote updates the verdict. Only the
  // FIRST vote moves the scoring weight below — re-applying the multiplier on
  // every click would let one user compound it arbitrarily.
  const [prior] = await scoped.select(
    feedback,
    and(
      eq(feedback.userId, session.user.id),
      eq(feedback.targetType, parsed.data.targetType),
      eq(feedback.targetId, parsed.data.targetId),
    ),
  );
  await scoped
    .insert(feedback, {
      userId: session.user.id,
      ...parsed.data,
    })
    .onConflictDoUpdate({
      target: [
        feedback.workosOrgId,
        feedback.userId,
        feedback.targetType,
        feedback.targetId,
      ],
      set: { verdict: parsed.data.verdict },
    });

  // Feedback loop v1 (scoring doc): signal verdicts move the (entity ×
  // category) weight. "wrong" never re-weights — the feedback row itself is
  // the review record for a defective score.
  if (
    !prior &&
    parsed.data.targetType === "signal" &&
    parsed.data.verdict !== "wrong" &&
    z.uuid().safeParse(parsed.data.targetId).success
  ) {
    const [signal] = await scoped.select(signals, eq(signals.id, parsed.data.targetId));
    if (signal) {
      const [existing] = await scoped.select(
        orgScoringWeights,
        and(
          eq(orgScoringWeights.entityId, signal.entityId),
          eq(orgScoringWeights.category, signal.category),
        ),
      );
      const next = applyVerdict(existing ?? DEFAULT_WEIGHT, parsed.data.verdict);
      await writeWeight(scoped, signal.entityId, signal.category, next);
    }
  }
  revalidatePath("/dashboard");
}

/**
 * Outcome loop (2.2): creating an action is ONE CLICK where the
 * recommendation already is — the description arrives pre-filled from
 * recommended_action. Action-taken on a signal is the strongest possible
 * "useful", fed through the same weight machinery as feedback verdicts.
 */

const CreateActionInput = z.object({
  sourceType: z.enum(actionSourceType.enumValues),
  sourceId: z.uuid(),
  description: z.string().trim().min(1).max(500),
});

export async function createAction(formData: FormData) {
  const session = await requireAuth();
  if (!session.organizationId) return;
  const parsed = CreateActionInput.safeParse({
    sourceType: formData.get("sourceType"),
    sourceId: formData.get("sourceId"),
    description: formData.get("description"),
  });
  if (!parsed.success) return;

  const scoped = scopedDb(session.organizationId);
  await scoped.insert(actions, {
    ...parsed.data,
    ownerUserId: session.user.id,
  });

  if (parsed.data.sourceType === "signal") {
    const [signal] = await scoped.select(
      signals,
      eq(signals.id, parsed.data.sourceId),
    );
    if (signal) {
      const [existing] = await scoped.select(
        orgScoringWeights,
        and(
          eq(orgScoringWeights.entityId, signal.entityId),
          eq(orgScoringWeights.category, signal.category),
        ),
      );
      const next = applyActionTaken(existing ?? DEFAULT_WEIGHT);
      await writeWeight(scoped, signal.entityId, signal.category, next);
    }
  }
  revalidatePath("/dashboard");
}

const CloseActionInput = z.object({
  actionId: z.uuid(),
  disposition: z.enum(["done", "dropped"]),
  note: z
    .string()
    .trim()
    .max(200)
    .transform((s) => (s === "" ? null : s))
    .nullish(),
});

export async function closeUserAction(formData: FormData) {
  const session = await requireAuth();
  if (!session.organizationId) return;
  const parsed = CloseActionInput.safeParse({
    actionId: formData.get("actionId"),
    disposition: formData.get("disposition"),
    note: formData.get("note"),
  });
  if (!parsed.success) return;

  const scoped = scopedDb(session.organizationId);
  const [action] = await scoped.select(
    actions,
    eq(actions.id, parsed.data.actionId),
  );
  if (!action) return;
  const descriptor = closeDescriptor(action.status, {
    disposition: parsed.data.disposition,
    note: parsed.data.note,
  });
  if (!descriptor) {
    // Already closed — idempotent, but a note sent after the close still
    // lands as an outcome (same behavior as the email close endpoint).
    if (action.status === parsed.data.disposition && parsed.data.note) {
      await scoped.insert(outcomes, {
        actionId: action.id,
        kpi: parsed.data.note,
        result: action.status,
        evidenceIds: [],
      });
      revalidatePath("/dashboard");
    }
    return;
  }

  await scoped.update(actions, descriptor.update, eq(actions.id, action.id));
  if (descriptor.outcome) {
    await scoped.insert(outcomes, {
      actionId: action.id,
      kpi: descriptor.outcome.kpi,
      result: descriptor.outcome.result,
      evidenceIds: [],
    });
  }
  revalidatePath("/dashboard");
}
