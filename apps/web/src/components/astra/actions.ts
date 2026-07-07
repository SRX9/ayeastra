"use server";

import { z } from "zod";

import { feedback, scopedDb } from "@ayeastra/db";
import { withAuth } from "@workos-inc/authkit-nextjs";

import { astraSuggestions } from "@/lib/suggestions";

/** Suggestions for the floating panel's empty state — non-redirecting auth
 * like the palette search action: signed-out or org-less just gets none. */
export async function getAstraSuggestions(): Promise<string[]> {
  const session = await withAuth();
  const orgId = session.user ? session.organizationId : undefined;
  if (!orgId) return [];
  try {
    return (await astraSuggestions(orgId)).slice(0, 3);
  } catch {
    return [];
  }
}

const FeedbackInput = z.object({
  messageId: z.uuid(),
  verdict: z.enum(["useful", "not_useful"]),
});

/** Thumbs on an Astra answer → the shared feedback table (ask doc). */
export async function submitAstraFeedback(
  messageId: string,
  verdict: "useful" | "not_useful",
): Promise<void> {
  const session = await withAuth();
  if (!session.user || !session.organizationId) return;
  const parsed = FeedbackInput.safeParse({ messageId, verdict });
  if (!parsed.success) return;
  // Idempotent per (user × answer): a repeat vote updates the verdict
  // instead of stacking rows into the useful-rate metric.
  await scopedDb(session.organizationId)
    .insert(feedback, {
      userId: session.user.id,
      targetType: "ask_answer",
      targetId: parsed.data.messageId,
      verdict: parsed.data.verdict,
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
}
