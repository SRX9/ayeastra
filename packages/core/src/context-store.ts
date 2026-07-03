import { desc } from "drizzle-orm";

import { businessContext, getDb, type ScopedDb } from "@ayeastra/db";

import { BusinessContext } from "./business-context";

/**
 * Versioned context persistence (context doc): append-only, current =
 * max(version). Every write validates the full schema — a context that
 * can't score signals never lands.
 */

export interface ContextVersion {
  version: number;
  payload: BusinessContext;
  createdAt: Date;
}

export async function currentContext(
  scoped: ScopedDb,
): Promise<ContextVersion | null> {
  // Hand-built query, org-scoped via the sanctioned scope() predicate.
  const [latest] = await getDb()
    .select()
    .from(businessContext)
    .where(scoped.scope(businessContext))
    .orderBy(desc(businessContext.version))
    .limit(1);
  if (!latest) return null;
  return {
    version: latest.version,
    payload: BusinessContext.parse(latest.payload),
    createdAt: latest.createdAt,
  };
}

export async function appendContextVersion(
  scoped: ScopedDb,
  payload: BusinessContext,
  createdBy: string,
): Promise<number> {
  const valid = BusinessContext.parse(payload);
  const current = await currentContext(scoped);
  const version = (current?.version ?? 0) + 1;
  await scoped.insert(businessContext, {
    version,
    payload: valid,
    createdBy,
  });
  return version;
}
