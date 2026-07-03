import { z } from "zod";

/**
 * Card model + edit safety (battlecard doc): `edited` sections are never
 * auto-rewritten — human judgment wins, the machine annotates with a
 * staleness banner. Every mutation lands in the card changelog, which the
 * briefing's "battlecard updates" section reads.
 */

export const SECTION_KEYS = [
  "snapshot",
  "positioning_vs_us",
  "pricing_table",
  "strengths_weaknesses",
  "objection_handling",
  "recent_moves",
  "win_themes",
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

/** Sections signal categories refresh (doc: pricing table + recent moves
 * update on every relevant signal regardless). */
export const CATEGORY_SECTIONS: Record<string, SectionKey[]> = {
  pricing: ["pricing_table", "recent_moves", "positioning_vs_us"],
  packaging: ["pricing_table", "recent_moves"],
  launch: ["recent_moves", "strengths_weaknesses"],
  messaging: ["positioning_vs_us", "recent_moves"],
  funding: ["snapshot", "recent_moves"],
};

export const Section = z.object({
  content: z.string(),
  provenance: z.enum(["auto", "edited"]),
  updatedAt: z.iso.datetime(),
  /** Set when new intelligence contradicts an edited section. */
  staleSince: z.iso.datetime().nullable(),
  staleReason: z.string().nullable(),
});
export type Section = z.output<typeof Section>;

export const CardSections = z.partialRecord(z.enum(SECTION_KEYS), Section);
export type CardSections = z.output<typeof CardSections>;

export interface ChangelogEntry {
  at: string;
  section: SectionKey;
  action: "regenerated" | "edited" | "flagged_stale";
  /** Signal that triggered it, or user id for edits. */
  trigger: string;
}

export interface RefreshResult {
  sections: CardSections;
  changelog: ChangelogEntry[];
}

/**
 * battlecard.refresh core: apply regenerated content to the affected
 * sections only. Auto sections update; edited sections are flagged stale,
 * never overwritten.
 */
export function applyRefresh(args: {
  existing: CardSections;
  regenerated: Partial<Record<SectionKey, string>>;
  signalId: string;
  reason: string;
  now?: Date;
}): RefreshResult {
  const at = (args.now ?? new Date()).toISOString();
  const sections: CardSections = { ...args.existing };
  const changelog: ChangelogEntry[] = [];

  for (const [key, content] of Object.entries(args.regenerated) as Array<
    [SectionKey, string]
  >) {
    const current = sections[key];
    if (current?.provenance === "edited") {
      sections[key] = {
        ...current,
        staleSince: current.staleSince ?? at,
        staleReason: args.reason,
      };
      changelog.push({ at, section: key, action: "flagged_stale", trigger: args.signalId });
      continue;
    }
    if (current?.content === content) continue; // no-op regen: no churn
    sections[key] = {
      content,
      provenance: "auto",
      updatedAt: at,
      staleSince: null,
      staleReason: null,
    };
    changelog.push({ at, section: key, action: "regenerated", trigger: args.signalId });
  }
  return { sections, changelog };
}

/** User edit: content replaces, provenance flips, staleness clears. */
export function applyEdit(args: {
  existing: CardSections;
  section: SectionKey;
  content: string;
  userId: string;
  now?: Date;
}): RefreshResult {
  const at = (args.now ?? new Date()).toISOString();
  return {
    sections: {
      ...args.existing,
      [args.section]: {
        content: args.content,
        provenance: "edited",
        updatedAt: at,
        staleSince: null,
        staleReason: null,
      },
    },
    changelog: [{ at, section: args.section, action: "edited", trigger: args.userId }],
  };
}

/** Which sections a battlecard-relevant signal refreshes; [] = not relevant. */
export function sectionsForCategory(category: string): SectionKey[] {
  return CATEGORY_SECTIONS[category] ?? [];
}
