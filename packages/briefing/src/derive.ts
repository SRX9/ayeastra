import type { BriefingBlock } from "./ast";

/**
 * Derived sections (briefing doc): the impact map is "the visible proof of
 * grounding" and battlecard updates are changelog reads — both DETERMINISTIC.
 * No model call ever builds these; scoring already attached priorities.
 */

export interface ImpactSignal {
  id: string;
  entity: string;
  finding: string;
  priorityAttachments:
    | Array<{ priorityId: string; segment?: string | null }>
    | null;
}

/** Signals × (stated priorities, target segments). One block per priority
 * with attached signals; one per segment. Unattached priorities are listed
 * as "no pressure detected" — coverage honesty, not padding. */
export function deriveImpactMap(
  signals: ImpactSignal[],
  priorities: Array<{ id: string; text: string }>,
  segments: string[],
): BriefingBlock[] {
  const blocks: BriefingBlock[] = [];

  for (const priority of priorities) {
    const hits = signals.filter((s) =>
      s.priorityAttachments?.some((a) => a.priorityId === priority.id),
    );
    blocks.push({
      heading: priority.text,
      text:
        hits.length === 0
          ? "No competitive pressure detected this period."
          : hits.map((s) => `${s.entity}: ${s.finding}`).join(" · "),
      refs: [],
      ownerRole: null,
      signalIds: hits.map((s) => s.id),
    });
  }

  for (const segment of segments) {
    const hits = signals.filter((s) =>
      s.priorityAttachments?.some((a) => a.segment === segment),
    );
    if (hits.length === 0) continue; // segments only appear when touched
    blocks.push({
      heading: `Segment: ${segment}`,
      text: hits.map((s) => `${s.entity}: ${s.finding}`).join(" · "),
      refs: [],
      ownerRole: null,
      signalIds: hits.map((s) => s.id),
    });
  }

  return blocks;
}

export interface BattlecardChange {
  entity: string;
  sectionKey: string;
  note: string;
  at: string; // ISO date
}

/** "What changed in which card this week" — grouped per entity, linkable. */
export function deriveBattlecardUpdates(
  changes: BattlecardChange[],
): BriefingBlock[] {
  const byEntity = new Map<string, BattlecardChange[]>();
  for (const c of changes) {
    const list = byEntity.get(c.entity) ?? [];
    list.push(c);
    byEntity.set(c.entity, list);
  }
  return [...byEntity.entries()].map(([entity, list]) => ({
    heading: entity,
    text: list.map((c) => `${c.sectionKey}: ${c.note} (${c.at})`).join(" · "),
    refs: [],
    ownerRole: null,
  }));
}

/** Quiet-week coverage proof: what was checked, stated plainly. */
export function deriveCoverage(
  checked: Array<{ entity: string; sourceCount: number }>,
): BriefingBlock[] {
  if (checked.length === 0) return [];
  return [
    {
      heading: null,
      text: checked
        .map((c) => `${c.entity} (${c.sourceCount} sources)`)
        .join(" · "),
      refs: [],
      ownerRole: null,
    },
  ];
}
