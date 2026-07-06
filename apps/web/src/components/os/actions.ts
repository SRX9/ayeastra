"use server";

import { withAuth } from "@workos-inc/authkit-nextjs";

import { listBriefings, listWatchedEntities } from "@/lib/intel";
import { listMissions, listReports } from "@/lib/workflow";

export interface PaletteResult {
  group: "Entities" | "Briefings" | "Missions" | "Reports";
  label: string;
  href: string;
}

const MAX_RESULTS = 12;

/** Command-palette search across org objects. Org datasets are small, so we
 * reuse the existing list helpers and filter by name here. Unauthenticated or
 * org-less callers get an empty list instead of a redirect. */
export async function paletteSearch(query: string): Promise<PaletteResult[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const session = await withAuth();
  const orgId = session.user ? session.organizationId : undefined;
  if (!orgId) return [];

  const [entities, briefings, missions, reports] = await Promise.all([
    listWatchedEntities(orgId).catch(() => []),
    listBriefings(orgId).catch(() => []),
    listMissions(orgId).catch(() => []),
    listReports(orgId).catch(() => []),
  ]);

  const matches = (text: string) => text.toLowerCase().includes(q);
  const results: PaletteResult[] = [
    ...entities
      .filter((e) => matches(e.name) || matches(e.domain ?? ""))
      .map((e) => ({
        group: "Entities" as const,
        label: e.name,
        href: `/entities/${e.entityId}`,
      })),
    ...missions
      .filter((m) => matches(m.goal))
      .map((m) => ({
        group: "Missions" as const,
        label: m.goal,
        href: `/missions/${m.id}`,
      })),
    ...reports
      .filter((r) => matches(r.title))
      .map((r) => ({
        group: "Reports" as const,
        label: r.title,
        href: `/reports/${r.id}`,
      })),
    ...briefings
      .filter((b) => matches(`${b.kind} briefing ${b.periodEnd}`))
      .map((b) => ({
        group: "Briefings" as const,
        label: `${b.kind} briefing · ${String(b.periodEnd).slice(0, 10)}`,
        href: `/briefings/${b.id}`,
      })),
  ];

  return results.slice(0, MAX_RESULTS);
}
