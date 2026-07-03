import type { SectionKey } from "./select";

/**
 * One section AST, three render targets (briefing doc step 7): web reader
 * (apps/web consumes the AST directly), email (full content), Slack (digest).
 * The AST is what gets stored on briefings.sections — renderers are pure
 * functions over it, so the archive can always be re-rendered.
 */

export type BriefingSectionKey =
  | SectionKey
  | "exec_summary"
  | "impact_map"
  | "battlecard_updates"
  | "recommended_actions"
  | "coverage";

export interface BriefingBlock {
  heading: string | null;
  text: string;
  /** F-refs resolved via `citations`; empty for derived/mechanical blocks. */
  refs: string[];
  /** recommended_actions only. */
  ownerRole: string | null;
  /** Deep links for derived sections (impact map rows → signals). */
  signalIds?: string[];
}

export interface BriefingSection {
  key: BriefingSectionKey;
  title: string;
  blocks: BriefingBlock[];
}

export interface BriefingCitation {
  evidenceId: string;
  sourceUrl: string | null;
  fetchedAt: string | null;
}

export interface BriefingAst {
  kind: "weekly" | "baseline";
  periodLabel: string;
  orgName: string;
  quietWeek: boolean;
  sections: BriefingSection[];
  /** F-ref → evidence for citation chips; validated upstream by the QA gate. */
  citations: Record<string, BriefingCitation>;
  /** Web-reader deep link (Slack digest + email footer point here). */
  webUrl: string;
}

export const SECTION_TITLES: Record<BriefingSectionKey, string> = {
  exec_summary: "Executive summary",
  top_moves: "Top competitor moves",
  pricing_packaging: "Pricing & packaging changes",
  launches: "Launches & changelog highlights",
  messaging: "Messaging & positioning shifts",
  impact_map: "Impact map",
  battlecard_updates: "Battlecard updates",
  recommended_actions: "Recommended actions",
  coverage: "What we checked",
};

/** Canonical reading order; assemble emits sections in this order. */
const SECTION_ORDER: BriefingSectionKey[] = [
  "exec_summary",
  "top_moves",
  "pricing_packaging",
  "launches",
  "messaging",
  "impact_map",
  "battlecard_updates",
  "recommended_actions",
  "coverage",
];

export interface AssembleInput {
  kind: "weekly" | "baseline";
  periodLabel: string;
  orgName: string;
  quietWeek: boolean;
  webUrl: string;
  citations: Record<string, BriefingCitation>;
  /** Sections in any order, already QA-gated; empty ones are dropped. */
  sections: Partial<Record<BriefingSectionKey, BriefingBlock[]>>;
}

export function assembleBriefing(input: AssembleInput): BriefingAst {
  const sections: BriefingSection[] = [];
  for (const key of SECTION_ORDER) {
    const blocks = input.sections[key];
    if (!blocks || blocks.length === 0) continue; // dropped/empty: honest omission
    sections.push({ key, title: SECTION_TITLES[key], blocks });
  }
  return {
    kind: input.kind,
    periodLabel: input.periodLabel,
    orgName: input.orgName,
    quietWeek: input.quietWeek,
    sections,
    citations: input.citations,
    webUrl: input.webUrl,
  };
}
