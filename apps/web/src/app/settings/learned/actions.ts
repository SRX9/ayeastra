"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { orgScoringWeights, scopedDb, signalCategory } from "@ayeastra/db";

import { requireAuth } from "@/lib/auth";

const Input = z.object({
  entityId: z.uuid(),
  category: z.enum(signalCategory.enumValues),
});

/** Learned behavior must be resettable (scoring doc): back to multiplier 1,
 * streak cleared — the org's slate wiped for that entity × category. */
export async function resetWeight(formData: FormData) {
  const session = await requireAuth();
  if (!session.organizationId) return;
  const parsed = Input.safeParse({
    entityId: formData.get("entityId"),
    category: formData.get("category"),
  });
  if (!parsed.success) return;

  const scoped = scopedDb(session.organizationId);
  await scoped.update(
    orgScoringWeights,
    { multiplier: 1, consecutiveNegative: 0 },
    and(
      eq(orgScoringWeights.entityId, parsed.data.entityId),
      eq(orgScoringWeights.category, parsed.data.category),
    ),
  );
  revalidatePath("/settings/learned");
}
