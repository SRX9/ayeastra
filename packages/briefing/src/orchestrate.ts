import {
  assembleBriefing,
  type BriefingAst,
  type BriefingBlock,
  type BriefingCitation,
  type BriefingSectionKey,
} from "./ast";
import { sectionDefsForModules, type ModuleKey } from "@ayeastra/modules";

import {
  deriveBattlecardUpdates,
  deriveConnectedIntelligence,
  deriveCoverage,
  deriveImpactMap,
  deriveMissionUpdates,
  deriveOpenActions,
  type BattlecardChange,
  type ConnectedInsight,
  type MissionUpdateLine,
  type OpenActionLine,
} from "./derive";
import { confidenceLint, numericCrossCheck, type QaIssue } from "./qa";
import { selectForBriefing, type SectionKey } from "./select";

/**
 * The briefing pipeline (briefing doc): gather → select → synthesize →
 * exec summary → QA gate → assemble. Pure over its inputs — the job wrapper
 * (Trigger.dev) supplies gathered data and the two synthesis functions, so
 * the whole pipeline is testable with fakes and the QA behavior (regenerate
 * once, then drop and log) is asserted mechanically, not hoped for.
 */

export interface GatheredSignal {
  id: string;
  entityId: string;
  entity: string;
  category: string;
  severity: "critical" | "high" | "notable" | "info";
  grounding: number;
  finding: string;
  whyItMatters: string;
  evidenceIds: string[];
  sourceUrl: string | null;
  date: string; // ISO date
  /** extracted_facts from the underlying change — QA numeric source. */
  extractedFacts: unknown;
  priorityAttachments: Array<{ priorityId: string; segment?: string | null }> | null;
  carryover?: boolean;
}

export interface SectionFact {
  ref: string;
  text: string;
  entity: string;
  date: string | null;
}

export interface SynthBlock {
  heading: string | null;
  text: string;
  refs: string[];
  ownerRole: string | null;
}

export interface Synth {
  /** brief-section task; qaNotes carries QA-gate errors on the retry. */
  section(input: {
    sectionKey: SectionKey;
    facts: SectionFact[];
    entityMemory: Array<{ entity: string; note: string }>;
    qaNotes: string[];
  }): Promise<{ blocks: SynthBlock[] }>;
  execSummary(input: {
    sections: Array<{ key: string; blocks: Array<{ text: string; refs: string[] }> }>;
  }): Promise<{ bullets: Array<{ text: string; refs: string[] }> }>;
}

export interface OrchestrateInput {
  kind: "weekly" | "baseline";
  orgName: string;
  periodLabel: string;
  webUrl: string;
  /** Active modules (2.1) — their sections merge into THIS one briefing. */
  modules?: ModuleKey[];
  signals: GatheredSignal[];
  entityMemory: Array<{ entity: string; note: string }>;
  battlecardChanges: BattlecardChange[];
  coverage: Array<{ entity: string; sourceCount: number }>;
  priorities: Array<{ id: string; text: string }>;
  segments: string[];
  /** Open actions ride the briefing as one compact line (2.2). */
  openActions?: OpenActionLine[];
  /** Categories under budget pressure from dropped actions (2.2). */
  pressuredCategories?: ReadonlySet<string>;
  /** Fusion insights (3.1) — already verified + cited; the job supplies each
   * insight's evidence rows so citations join the briefing's F-ref chain. */
  insights?: OrchestrateInsight[];
  /** Active missions (3.2) — one compact section in the ONE weekly. */
  missionUpdates?: MissionUpdateLine[];
}

export interface OrchestrateInsight
  extends Omit<ConnectedInsight, "refs"> {
  evidence: Array<{
    evidenceId: string;
    sourceUrl: string | null;
    fetchedAt: string | null;
  }>;
}

export interface SectionDrop {
  key: string;
  issues: string[];
}

export interface OrchestrateResult {
  ast: BriefingAst;
  quietWeek: boolean;
  /** QA-gate drops — the job routes these to the internal log/ops alert. */
  drops: SectionDrop[];
}

export async function orchestrateBriefing(
  input: OrchestrateInput,
  synth: Synth,
): Promise<OrchestrateResult> {
  const sectionDefs = sectionDefsForModules(input.modules ?? ["competitive_watch"]);
  const synthSections: SectionKey[] = [
    "top_moves",
    ...sectionDefs.map((d) => d.key),
    "recommended_actions",
  ];
  const selection = selectForBriefing(input.signals, {
    sections: sectionDefs,
    pressuredCategories: input.pressuredCategories,
  });
  const byId = new Map(input.signals.map((s) => [s.id, s]));

  // Global F-refs across the whole briefing: sections receive subsets, the
  // exec summary's citation chain and the AST citation map stay consistent.
  const selectedIds = [
    ...new Set(Object.values(selection.sections).flat()),
  ];
  const refOf = new Map(selectedIds.map((id, i) => [id, `F${i + 1}`]));
  const citations: Record<string, BriefingCitation> = {};
  for (const id of selectedIds) {
    const s = byId.get(id)!;
    citations[refOf.get(id)!] = {
      evidenceId: s.evidenceIds[0] ?? s.id,
      sourceUrl: s.sourceUrl,
      fetchedAt: s.date,
    };
  }

  const factFor = (id: string): SectionFact => {
    const s = byId.get(id)!;
    return {
      ref: refOf.get(id)!,
      text: `${s.entity}: ${s.finding} — ${s.whyItMatters}`,
      entity: s.entity,
      date: s.date,
    };
  };

  const sections: Partial<Record<BriefingSectionKey, BriefingBlock[]>> = {};
  const synthesized: Array<{ key: string; blocks: SynthBlock[] }> = [];
  const drops: SectionDrop[] = [];

  for (const key of synthSections) {
    const ids =
      key === "recommended_actions"
        ? selectedIds
        : (selection.sections[key] ?? []);
    if (ids.length === 0) continue;
    const facts = ids.map(factFor);
    const citedFacts = ids.map((id) => ({
      finding: byId.get(id)!.finding,
      extracted: byId.get(id)!.extractedFacts,
    }));

    const result = await synthesizeWithQa(
      synth,
      key,
      facts,
      input.entityMemory,
      citedFacts,
    );
    if ("issues" in result) {
      drops.push({ key, issues: result.issues });
      continue;
    }
    sections[key] = result.blocks;
    synthesized.push({ key, blocks: result.blocks });
  }

  // Exec summary is written LAST, from finished sections only.
  if (synthesized.length > 0) {
    try {
      const exec = await synth.execSummary({ sections: synthesized });
      sections.exec_summary = exec.bullets.map((b) => ({
        heading: null,
        text: b.text,
        refs: b.refs,
        ownerRole: null,
      }));
    } catch (err) {
      drops.push({ key: "exec_summary", issues: [String(err)] });
    }
  }

  // Deterministic sections — never a model call.
  if (input.insights && input.insights.length > 0) {
    // Continue the global F-numbering across fusion-insight evidence so
    // their citation chips resolve through the same map.
    let nextRef = selectedIds.length + 1;
    const connected: ConnectedInsight[] = input.insights.map((i) => {
      const refs: string[] = [];
      for (const e of i.evidence) {
        const ref = `F${nextRef++}`;
        refs.push(ref);
        citations[ref] = {
          evidenceId: e.evidenceId,
          sourceUrl: e.sourceUrl,
          fetchedAt: e.fetchedAt,
        };
      }
      return { ...i, refs };
    });
    sections.connected_intelligence = deriveConnectedIntelligence(connected);
  }
  sections.impact_map = deriveImpactMap(
    input.signals.filter((s) => refOf.has(s.id)),
    input.priorities,
    input.segments,
  );
  sections.battlecard_updates = deriveBattlecardUpdates(input.battlecardChanges);
  sections.open_actions = deriveOpenActions(input.openActions ?? []);
  sections.mission_updates = deriveMissionUpdates(input.missionUpdates ?? []);
  if (selection.quietWeek || input.kind === "baseline") {
    sections.coverage = deriveCoverage(input.coverage);
  }

  return {
    ast: assembleBriefing({
      kind: input.kind,
      periodLabel: input.periodLabel,
      orgName: input.orgName,
      quietWeek: selection.quietWeek,
      webUrl: input.webUrl,
      citations,
      sections,
    }),
    quietWeek: selection.quietWeek,
    drops,
  };
}

/** QA gate: numeric cross-check + confidence lint; regenerate once with the
 * errors appended; still failing → drop (a shorter honest briefing wins). */
async function synthesizeWithQa(
  synth: Synth,
  sectionKey: SectionKey,
  facts: SectionFact[],
  entityMemory: Array<{ entity: string; note: string }>,
  citedFacts: unknown[],
): Promise<{ blocks: BriefingBlock[] } | { issues: string[] }> {
  let qaNotes: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    let blocks: SynthBlock[];
    try {
      ({ blocks } = await synth.section({ sectionKey, facts, entityMemory, qaNotes }));
    } catch (err) {
      return { issues: [String(err)] };
    }
    const issues: QaIssue[] = [
      ...numericCrossCheck(blocks.map((b) => b.text).join("\n"), citedFacts),
      ...confidenceLint(blocks.map((b) => b.text)),
    ];
    if (issues.length === 0) {
      return { blocks: blocks.map((b) => ({ ...b })) };
    }
    qaNotes = issues.map((i) => i.detail);
  }
  return { issues: qaNotes };
}
