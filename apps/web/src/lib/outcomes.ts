import { asc, eq } from "drizzle-orm";

import { actions, scopedDb } from "@ayeastra/db";

/** Open-actions read for the dashboard panel (2.2) — oldest first, capped:
 * a nudge surface, not a PM tool. */
export interface OpenAction {
  id: string;
  description: string;
  ownerUserId: string | null;
  createdAt: Date;
}

export async function listOpenActions(orgId: string): Promise<OpenAction[]> {
  const scoped = scopedDb(orgId);
  const rows = await scoped.select(actions, eq(actions.status, "open"));
  return rows
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, 20)
    .map((a) => ({
      id: a.id,
      description: a.description,
      ownerUserId: a.ownerUserId,
      createdAt: a.createdAt,
    }));
}
