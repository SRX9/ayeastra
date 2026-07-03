import {
  assembleBriefing,
  confidenceLint,
  deriveCoverage,
  numericCrossCheck,
  rankScore,
  type BriefingAst,
  type BriefingBlock,
  type BriefingCitation,
  type GatheredSignal,
  type QaIssue,
  type SectionFact,
  type Synth,
} from "@ayeastra/briefing";
import {
  firableValidated,
  type PatternRow,
  readValidation,
  renderTrackRecord,
} from "@ayeastra/fusion";
import { deriveValueRecap, type RecapInput } from "@ayeastra/outcomes";

/**
 * Board Mode (3.2): the quarterly executive artifact, auto-assembled from
 * existing scored objects — selection + synthesis + the SAME QA gate as
 * briefings, quarterly scope. Rides the briefings table (kind "board") and
 * the same AST/renderers; the web reader is already print-friendly, which
 * is the boardroom PDF path (buy-don't-build).
 */

export const BOARD_HIGHLIGHT_BUDGET = 8;

export interface QuarterActivity {
  entity: string;
  category: string;
}

/**
 * Landscape shifts, quarter over quarter, straight from the archive: per
 * entity, category counts vs the previous quarter. Deterministic — the
 * archive speaks for itself.
 */
export function deriveLandscapeShifts(input: {
  thisQuarter: QuarterActivity[];
  lastQuarter: QuarterActivity[];
}): BriefingBlock[] {
  const count = (rows: QuarterActivity[]) => {
    const m = new Map<string, Map<string, number>>();
    for (const r of rows) {
      const per = m.get(r.entity) ?? new Map<string, number>();
      per.set(r.category, (per.get(r.category) ?? 0) + 1);
      m.set(r.entity, per);
    }
    return m;
  };
  const now = count(input.thisQuarter);
  const prev = count(input.lastQuarter);

  const blocks: BriefingBlock[] = [];
  for (const [entity, per] of [...now.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const parts = [...per.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([category, n]) => {
        const was = prev.get(entity)?.get(category) ?? 0;
        return `${category} ×${n} (was ${was})`;
      });
    blocks.push({
      heading: entity,
      text: parts.join(" · "),
      refs: [],
      ownerRole: null,
    });
  }
  return blocks;
}

/**
 * Validated-pattern outlook: each validated pattern with its mechanical
 * track record, verbatim from validation jsonb (fusion law: the model never
 * computes these — and here no model is even involved).
 */
export function derivePatternOutlook(patterns: PatternRow[]): BriefingBlock[] {
  return firableValidated(patterns).map((p) => ({
    heading: p.claim,
    text: renderTrackRecord(readValidation(p.validation)),
    refs: [],
    ownerRole: null,
  }));
}

/** Top quarterly signals by the briefing rank score — selection is code. */
export function selectBoardHighlights(
  signals: GatheredSignal[],
  budget = BOARD_HIGHLIGHT_BUDGET,
): GatheredSignal[] {
  return [...signals]
    .sort(
      (a, b) =>
        rankScore({ ...b, carryover: false }) - rankScore({ ...a, carryover: false }) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, budget);
}

export interface BoardInput {
  orgName: string;
  /** e.g. "Q2 2026" */
  periodLabel: string;
  webUrl: string;
  signals: GatheredSignal[];
  landscape: { thisQuarter: QuarterActivity[]; lastQuarter: QuarterActivity[] };
  recap: RecapInput;
  patterns: PatternRow[];
  coverage: Array<{ entity: string; sourceCount: number }>;
}

export interface BoardResult {
  ast: BriefingAst;
  drops: Array<{ key: string; issues: string[] }>;
}

export async function assembleBoard(
  input: BoardInput,
  synth: Synth,
): Promise<BoardResult> {
  const highlights = selectBoardHighlights(input.signals);
  const refOf = new Map(highlights.map((s, i) => [s.id, `F${i + 1}`]));
  const citations: Record<string, BriefingCitation> = {};
  for (const s of highlights) {
    citations[refOf.get(s.id)!] = {
      evidenceId: s.evidenceIds[0] ?? s.id,
      sourceUrl: s.sourceUrl,
      fetchedAt: s.date,
    };
  }
  const facts: SectionFact[] = highlights.map((s) => ({
    ref: refOf.get(s.id)!,
    text: `${s.entity}: ${s.finding} — ${s.whyItMatters}`,
    entity: s.entity,
    date: s.date,
  }));

  const sections: Partial<Record<string, BriefingBlock[]>> = {};
  const drops: Array<{ key: string; issues: string[] }> = [];

  // Synthesized highlights: same regenerate-once-then-drop QA discipline.
  if (facts.length > 0) {
    let qaNotes: string[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      let blocks;
      try {
        ({ blocks } = await synth.section({
          sectionKey: "board_highlights",
          facts,
          entityMemory: [],
          qaNotes,
        }));
      } catch (err) {
        drops.push({ key: "strategic_highlights", issues: [String(err)] });
        break;
      }
      const issues: QaIssue[] = [
        ...numericCrossCheck(
          blocks.map((b) => b.text).join("\n"),
          highlights.map((s) => ({ finding: s.finding, extracted: s.extractedFacts })),
        ),
        ...confidenceLint(blocks.map((b) => b.text)),
      ];
      if (issues.length === 0) {
        sections.strategic_highlights = blocks.map((b) => ({ ...b }));
        break;
      }
      qaNotes = issues.map((i) => i.detail);
      if (attempt === 1) drops.push({ key: "strategic_highlights", issues: qaNotes });
    }
  }

  if (sections.strategic_highlights) {
    try {
      const exec = await synth.execSummary({
        sections: [
          { key: "strategic_highlights", blocks: sections.strategic_highlights },
        ],
      });
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

  // Deterministic blocks — the honesty spine of the artifact.
  sections.landscape_shifts = deriveLandscapeShifts(input.landscape);
  sections.value_recap = deriveValueRecap(input.recap);
  sections.pattern_outlook = derivePatternOutlook(input.patterns);
  sections.coverage = deriveCoverage(input.coverage);

  return {
    ast: assembleBriefing({
      kind: "board",
      periodLabel: input.periodLabel,
      orgName: input.orgName,
      quietWeek: false,
      webUrl: input.webUrl,
      citations,
      sections,
    }),
    drops,
  };
}
