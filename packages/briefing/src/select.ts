import {
  sectionDefsForModules,
  type BriefingSectionDef,
  type ModuleKey,
} from "@ayeastra/modules";

/**
 * Selection is code, not model (briefing doc step 2): the model never
 * chooses what matters — scoring already did. Section defs come from the
 * org's ACTIVE MODULES (2.1: one briefing, module-merged sections, budgets
 * rebalanced), ranked by severity × grounding, cross-section dedup (a signal
 * leads once, is referenced elsewhere), and unresolved-CRITICAL carryover.
 */

export type SectionKey = string;

export interface SelectableSignal {
  id: string;
  category: string;
  severity: "critical" | "high" | "notable" | "info";
  /** ground-signal relevance 0–100. */
  grounding: number;
  /** Unresolved CRITICAL from the prior briefing (resurfaces once). */
  carryover?: boolean;
}

const SEVERITY_POINTS = { critical: 4, high: 3, notable: 2, info: 1 } as const;

/** Top moves is platform-level (cross-module), not owned by any manifest. */
export const TOP_MOVES_BUDGET = 5;

/** Signals below this across the week → quiet-week mode, honest short form. */
export const QUIET_WEEK_THRESHOLD = 3;

/** Budget pressure (2.2): a pressured section loses this many slots, floor 1
 * — fix the artifact before muting the intelligence. */
export const PRESSURE_SLOT_PENALTY = 1;

export interface SelectOptions {
  /** Org's active modules; defaults to the base module only. */
  modules?: ModuleKey[];
  /** Explicit section defs (tests / callers that already resolved them). */
  sections?: BriefingSectionDef[];
  /** Categories whose recommendations are repeatedly dropped (2.2). */
  pressuredCategories?: ReadonlySet<string>;
}

export interface Selection {
  /** Section → signal ids leading that section, budget-capped, ranked. */
  sections: Record<SectionKey, string[]>;
  quietWeek: boolean;
}

export function rankScore(s: SelectableSignal): number {
  return SEVERITY_POINTS[s.severity] * (0.5 + s.grounding / 200);
}

export function selectForBriefing(
  signals: SelectableSignal[],
  opts: SelectOptions = {},
): Selection {
  const defs =
    opts.sections ?? sectionDefsForModules(opts.modules ?? ["competitive_watch"]);
  const pressured = opts.pressuredCategories ?? new Set<string>();

  const ranked = [...signals].sort((a, b) => {
    // Carryover CRITICALs resurface ahead of same-scored fresh signals.
    const carry = Number(b.carryover ?? false) - Number(a.carryover ?? false);
    return rankScore(b) - rankScore(a) || carry;
  });

  const lead = new Set<string>();
  const sections: Record<SectionKey, string[]> = {};

  // Themed sections claim their categories first…
  for (const def of defs) {
    const budget = def.categories.some((c) => pressured.has(c))
      ? Math.max(1, def.budget - PRESSURE_SLOT_PENALTY)
      : def.budget;
    sections[def.key] = ranked
      .filter((s) => def.categories.some((c) => c === s.category) && !lead.has(s.id))
      .slice(0, budget)
      .map((s) => s.id);
    for (const id of sections[def.key]!) lead.add(id);
  }

  // …then top moves takes the best of what's left (cross-section dedup).
  sections.top_moves = ranked
    .filter((s) => !lead.has(s.id) && SEVERITY_POINTS[s.severity] >= 2)
    .slice(0, TOP_MOVES_BUDGET)
    .map((s) => s.id);

  return {
    sections,
    quietWeek:
      signals.filter((s) => s.severity !== "info").length < QUIET_WEEK_THRESHOLD,
  };
}
