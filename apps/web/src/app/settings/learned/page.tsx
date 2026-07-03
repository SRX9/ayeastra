import { eq } from "drizzle-orm";

import { entities, getDb, orgScoringWeights, scopedDb } from "@ayeastra/db";

import { requireOrg } from "@/lib/auth";

import { resetWeight } from "./actions";

/** /settings/learned (web-app doc): what the scoring engine has learned
 * from this org's feedback — visible and resettable, never a black box. */
export default async function LearnedSettingsPage() {
  const session = await requireOrg();
  const db = getDb();
  const scoped = scopedDb(session.organizationId, db);

  const weights = await db
    .select({
      entityId: orgScoringWeights.entityId,
      entityName: entities.canonicalName,
      category: orgScoringWeights.category,
      multiplier: orgScoringWeights.multiplier,
      consecutiveNegative: orgScoringWeights.consecutiveNegative,
      updatedAt: orgScoringWeights.updatedAt,
    })
    .from(orgScoringWeights)
    .innerJoin(entities, eq(orgScoringWeights.entityId, entities.id))
    .where(scoped.scope(orgScoringWeights))
    .orderBy(entities.canonicalName, orgScoringWeights.category);

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-xl font-semibold">Learned behavior</h1>
      <p className="mb-6 text-sm text-muted">
        Your feedback (useful / not useful / wrong / already knew) adjusts how
        strongly each entity × category scores for you. Nothing here is
        hidden, and everything is resettable.
      </p>

      {weights.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing learned yet — give feedback on signals in the feed and the
          adjustments will show up here.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-1 pr-2 font-normal">Entity</th>
              <th className="py-1 pr-2 font-normal">Category</th>
              <th className="py-1 pr-2 font-normal">Weight</th>
              <th className="py-1 pr-2 font-normal">Negative streak</th>
              <th className="py-1 font-normal">
                <span className="sr-only">Reset</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {weights.map((w) => (
              <tr
                key={`${w.entityId}:${w.category}`}
                className="border-t border-neutral-200 dark:border-neutral-700"
              >
                <td className="py-1.5 pr-2 font-medium">{w.entityName}</td>
                <td className="py-1.5 pr-2">{w.category}</td>
                <td className="py-1.5 pr-2 font-mono">
                  ×{w.multiplier.toFixed(2)}
                  {w.multiplier !== 1 && (
                    <span className="ml-1 text-xs text-muted">
                      ({w.multiplier > 1 ? "boosted" : "dampened"})
                    </span>
                  )}
                </td>
                <td className="py-1.5 pr-2">{w.consecutiveNegative}</td>
                <td className="py-1.5 text-right">
                  {(w.multiplier !== 1 || w.consecutiveNegative > 0) && (
                    <form action={resetWeight}>
                      <input type="hidden" name="entityId" value={w.entityId} />
                      <input type="hidden" name="category" value={w.category} />
                      <button
                        type="submit"
                        className="rounded border border-neutral-300 px-2 py-0.5 text-xs hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
                      >
                        Reset
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
