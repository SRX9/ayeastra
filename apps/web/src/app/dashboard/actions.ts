"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import {
  feedback,
  feedbackTargetType,
  feedbackVerdict,
  scopedDb,
  signals,
  signalStatus,
} from "@ayeastra/db";

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
  await scoped.insert(feedback, {
    userId: session.user.id,
    ...parsed.data,
  });
  revalidatePath("/dashboard");
}
