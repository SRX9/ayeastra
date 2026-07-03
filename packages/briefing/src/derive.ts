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

export interface OpenActionLine {
  description: string;
  ownerName: string | null;
  ageDays: number;
}

/** Open actions ride the existing artifact (2.2): ONE compact line, no new
 * notification stream, no PM-tool ambitions. */
export function deriveOpenActions(open: OpenActionLine[]): BriefingBlock[] {
  if (open.length === 0) return [];
  const oldest = [...open].sort((a, b) => b.ageDays - a.ageDays).slice(0, 3);
  const items = oldest
    .map(
      (a) =>
        `${a.description}${a.ownerName ? ` (${a.ownerName})` : ""} — open ${a.ageDays}d`,
    )
    .join(" · ");
  return [
    {
      heading: null,
      text:
        open.length > oldest.length
          ? `${open.length} open actions. Oldest: ${items}`
          : items,
      refs: [],
      ownerRole: null,
    },
  ];
}

export interface MissionUpdateLine {
  missionId: string;
  goal: string;
  /** Latest stored brief's situation line; null before the first refresh. */
  situation: string | null;
  openActions: number;
}

/** Mission updates (3.2) ride the ONE weekly briefing — never a separate
 * stream. Compact, deterministic, from the stored mission briefs. */
export function deriveMissionUpdates(missions: MissionUpdateLine[]): BriefingBlock[] {
  return missions.map((m) => ({
    heading: m.goal,
    text: `${m.situation ?? "Watching — no developments synthesized yet."}${
      m.openActions > 0
        ? ` (${m.openActions} open action${m.openActions === 1 ? "" : "s"})`
        : ""
    }`,
    refs: [],
    ownerRole: null,
  }));
}

export interface ConnectedInsight {
  id: string;
  entity: string;
  kind: "correlation" | "deviation" | "pattern";
  pattern: string;
  analysis: string;
  forwardLook: string | null;
  confidence: "high" | "moderate" | "low";
  confidenceNotes: string | null;
  /** Deterministic renderTrackRecord() output (pattern kind) — data, not prose. */
  trackRecord: string | null;
  /** Per-org outcome corroboration line (tenancy-clean join). */
  corroboration: string | null;
  /** Pre-assigned F-refs — orchestration continues the briefing's numbering. */
  refs: string[];
  signalIds: string[];
}

/**
 * Connected intelligence (3.1) — DETERMINISTIC render of already-verified
 * fusion insights. The verifier wrote the prose inside a schema; track
 * records and stats are validation-jsonb data; no model call happens here
 * and every number is already evidence- or ledger-backed.
 */
export function deriveConnectedIntelligence(
  insights: ConnectedInsight[],
): BriefingBlock[] {
  return insights.map((i) => {
    const parts = [i.analysis];
    if (i.forwardLook) {
      // The confidence marker satisfies the predictive-claim lint (qa.ts).
      parts.push(`Outlook (${i.confidence} confidence): ${i.forwardLook}`);
    }
    if (i.trackRecord) parts.push(`Track record: ${i.trackRecord}`);
    if (i.corroboration) parts.push(i.corroboration);
    if (i.confidenceNotes) {
      parts.push(`What would change this: ${i.confidenceNotes}`);
    }
    return {
      heading: `${i.entity}: ${i.pattern}`,
      text: parts.join(" "),
      refs: i.refs,
      ownerRole: null,
      signalIds: i.signalIds,
      insightId: i.id,
    };
  });
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
