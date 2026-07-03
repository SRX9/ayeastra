import { MODULE_REGISTRY, type ModuleKey } from "@ayeastra/modules";

/**
 * One section AST, three render targets (briefing doc step 7): web reader
 * (apps/web consumes the AST directly), email (full content), Slack (digest).
 * The AST is what gets stored on briefings.sections — renderers are pure
 * functions over it, so the archive can always be re-rendered.
 *
 * Module sections (2.1) are registry-driven: titles, ordering slot, and the
 * module_key each section carries come from the manifests, so a new module
 * is configuration here, not code.
 */

export type BriefingSectionKey = string;

export interface BriefingBlock {
  heading: string | null;
  text: string;
  /** F-refs resolved via `citations`; empty for derived/mechanical blocks. */
  refs: string[];
  /** recommended_actions only. */
  ownerRole: string | null;
  /** Deep links for derived sections (impact map rows → signals). */
  signalIds?: string[];
  /** Connected-intelligence blocks (3.1) — feedback deep-link target. */
  insightId?: string;
}

export interface BriefingSection {
  key: BriefingSectionKey;
  title: string;
  /** Owning module for module-contributed sections (2.1 gating/entitlement). */
  moduleKey?: ModuleKey;
  blocks: BriefingBlock[];
}

export interface BriefingCitation {
  evidenceId: string;
  sourceUrl: string | null;
  fetchedAt: string | null;
}

export interface BriefingAst {
  kind: "weekly" | "baseline" | "board";
  periodLabel: string;
  orgName: string;
  quietWeek: boolean;
  sections: BriefingSection[];
  /** F-ref → evidence for citation chips; validated upstream by the QA gate. */
  citations: Record<string, BriefingCitation>;
  /** Web-reader deep link (Slack digest + email footer point here). */
  webUrl: string;
}

/** Platform sections — present regardless of module mix. Board-only keys
 * (3.2) live here too: one AST, one assembler, one renderer set — a weekly
 * simply never produces them. */
const PLATFORM_TITLES: Record<string, string> = {
  exec_summary: "Executive summary",
  connected_intelligence: "Connected intelligence",
  landscape_shifts: "Competitive landscape shifts",
  strategic_highlights: "Strategic signal highlights",
  top_moves: "Top competitor moves",
  mission_updates: "Mission updates",
  impact_map: "Impact map",
  battlecard_updates: "Battlecard updates",
  open_actions: "Open actions",
  recommended_actions: "Recommended actions",
  value_recap: "Quarterly value recap",
  pattern_outlook: "Validated-pattern outlook",
  coverage: "What we checked",
};

const MODULE_SECTION_META = new Map<string, { title: string; moduleKey: ModuleKey }>();
for (const manifest of Object.values(MODULE_REGISTRY)) {
  for (const def of manifest.briefingSections) {
    MODULE_SECTION_META.set(def.key, { title: def.title, moduleKey: manifest.key });
  }
}

export const SECTION_TITLES: Record<string, string> = {
  ...PLATFORM_TITLES,
  ...Object.fromEntries(
    [...MODULE_SECTION_META].map(([key, meta]) => [key, meta.title]),
  ),
};

/** Canonical reading order; module sections slot between top moves and the
 * derived sections, in registry order. */
const SECTION_ORDER: BriefingSectionKey[] = [
  "exec_summary",
  // Fusion insights (3.1) are rare and prominent — directly under the exec
  // summary; weeks without them drop the section entirely (honest omission).
  "connected_intelligence",
  // Board Mode (3.2): landscape → highlights → …recap → outlook → coverage.
  "landscape_shifts",
  "strategic_highlights",
  "top_moves",
  "mission_updates",
  ...MODULE_SECTION_META.keys(),
  "impact_map",
  "battlecard_updates",
  "open_actions",
  "recommended_actions",
  "value_recap",
  "pattern_outlook",
  "coverage",
];

export interface AssembleInput {
  kind: "weekly" | "baseline" | "board";
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
    const meta = MODULE_SECTION_META.get(key);
    sections.push({
      key,
      title: SECTION_TITLES[key] ?? key,
      ...(meta ? { moduleKey: meta.moduleKey } : {}),
      blocks,
    });
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
