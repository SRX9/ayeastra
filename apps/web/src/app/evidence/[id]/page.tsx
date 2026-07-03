import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { evidence, getDb } from "@ayeastra/db";
import { withAuth } from "@workos-inc/authkit-nextjs";

import { getSharedEvidence } from "@/lib/intel";

/**
 * Evidence viewer (diff-evidence doc): hash-verified, timestamped,
 * permanently linkable. Public with a valid share token (?t=) — every
 * forwarded diff is a product demo — otherwise requires a session.
 * Evidence is global observation-layer data; no org gate applies.
 */

const FETCHED_FMT = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

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

  const extracted = row.extracted
    ? JSON.stringify(row.extracted, null, 2)
    : null;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 rounded border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <a
            href={row.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium hover:underline"
          >
            {row.sourceUrl}
          </a>
          <span className="text-muted">
            fetched {FETCHED_FMT.format(row.fetchedAt)} UTC
          </span>
          <span
            className="rounded bg-green-100 px-1.5 py-0.5 font-mono text-[11px] text-green-800 dark:bg-green-950 dark:text-green-300"
            title={row.contentHash}
          >
            hash-verified · {row.contentHash.slice(0, 12)}…
          </span>
        </div>
      </div>

      <h1 className="mb-1 text-lg font-semibold">Evidence record</h1>
      <p className="mb-6 text-sm text-muted">
        Captured and content-hashed by AyeAstra at fetch time. This record is
        immutable — it cannot be edited, by us or anyone else.
      </p>

      {extracted && (
        <>
          <h2 className="mb-2 text-base font-semibold">Extracted facts</h2>
          <pre className="mb-6 overflow-x-auto rounded border border-neutral-200 bg-neutral-50 p-4 text-xs dark:border-neutral-700 dark:bg-neutral-900">
            {extracted}
          </pre>
        </>
      )}

      <p className="text-xs text-muted">
        Stored page captures (before/after HTML, rendered diff, screenshots)
        attach here once archive storage is connected.
      </p>
    </div>
  );
}
