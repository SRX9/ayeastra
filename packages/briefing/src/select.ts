/**
 * Selection is code, not model (briefing doc step 2): the model never
 * chooses what matters — scoring already did. Per-section budgets ranked by
 * severity × grounding, cross-section dedup (a signal leads once, is
 * referenced elsewhere), and unresolved-CRITICAL carryover.
 */

export type SectionKey =
  | "top_moves"
  | "pricing_packaging"
  | "launches"
  | "messaging";

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

export const SECTION_BUDGETS: Record<SectionKey, number> = {
  top_moves: 5,
  pricing_packaging: 4,
  launches: 5,
  messaging: 4,
};

const SECTION_CATEGORIES: Record<Exclude<SectionKey, "top_moves">, string[]> = {
  pricing_packaging: ["pricing", "packaging"],
  launches: ["launch"],
  messaging: ["messaging"],
};

/** Signals below this across the week → quiet-week mode, honest short form. */
export const QUIET_WEEK_THRESHOLD = 3;

export interface Selection {
  /** Section → signal ids leading that section, budget-capped, ranked. */
  sections: Record<SectionKey, string[]>;
  quietWeek: boolean;
}

export function rankScore(s: SelectableSignal): number {
  return SEVERITY_POINTS[s.severity] * (0.5 + s.grounding / 200);
}

export function selectForBriefing(signals: SelectableSignal[]): Selection {
  const ranked = [...signals].sort((a, b) => {
    // Carryover CRITICALs resurface ahead of same-scored fresh signals.
    const carry = Number(b.carryover ?? false) - Number(a.carryover ?? false);
    return rankScore(b) - rankScore(a) || carry;
  });

  const lead = new Set<string>();
  const sections = {} as Record<SectionKey, string[]>;

  // Themed sections claim their categories first…
  for (const [key, categories] of Object.entries(SECTION_CATEGORIES) as Array<
    [Exclude<SectionKey, "top_moves">, string[]]
  >) {
    sections[key] = ranked
      .filter((s) => categories.includes(s.category) && !lead.has(s.id))
      .slice(0, SECTION_BUDGETS[key])
      .map((s) => s.id);
    for (const id of sections[key]) lead.add(id);
  }

  // …then top moves takes the best of what's left (cross-section dedup).
  sections.top_moves = ranked
    .filter((s) => !lead.has(s.id) && SEVERITY_POINTS[s.severity] >= 2)
    .slice(0, SECTION_BUDGETS.top_moves)
    .map((s) => s.id);

  return {
    sections,
    quietWeek:
      signals.filter((s) => s.severity !== "info").length < QUIET_WEEK_THRESHOLD,
  };
}
