import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { evidence, getDb } from "@ayeastra/db";
import { withAuth } from "@workos-inc/authkit-nextjs";

import { DiffViewer, type PricingDeltaRow } from "@/components/intel/diff-viewer";
import { getSharedEvidence } from "@/lib/intel";

/**
 * Evidence viewer (diff-evidence doc): hash-verified, timestamped,
 * permanently linkable. Public with a valid share token (?t=) — every
 * forwarded diff is a product demo — otherwise requires a session.
 * Evidence is global observation-layer data; no org gate applies.
 */

/** No/invalid token: only signed-in users may view. The record fetch has no
 * side effects, so it runs alongside the session check. */
async function authedEvidence(id: string) {
  const [session, [record]] = await Promise.all([
    withAuth(),
    getDb().select().from(evidence).where(eq(evidence.id, id)),
  ]);
  if (!session.user) notFound();
  return record ?? null;
}

/** Structured deltas land in extracted.pricingDeltas (diff engine). */
function pricingDeltasFrom(extracted: unknown): PricingDeltaRow[] | undefined {
  if (
    extracted &&
    typeof extracted === "object" &&
    "pricingDeltas" in extracted &&
    Array.isArray((extracted as { pricingDeltas: unknown }).pricingDeltas)
  ) {
    return (extracted as { pricingDeltas: PricingDeltaRow[] }).pricingDeltas;
  }
  return undefined;
}

export default async function EvidencePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const [{ id }, { t }] = await Promise.all([params, searchParams]);

  const row = t ? await getSharedEvidence(id, t) : await authedEvidence(id);
  if (!row) notFound();

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-lg font-semibold">Evidence record</h1>
      <p className="mb-6 text-sm text-muted">
        Captured and content-hashed by AyeAstra at fetch time. This record is
        immutable — it cannot be edited, by us or anyone else.
      </p>
      <DiffViewer
        evidence={{
          sourceUrl: row.sourceUrl,
          fetchedAt: row.fetchedAt,
          contentHash: row.contentHash,
        }}
        pricingDeltas={pricingDeltasFrom(row.extracted)}
        extracted={row.extracted ?? undefined}
      />
    </div>
  );
}
