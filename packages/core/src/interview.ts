import {
  BusinessContextDraft,
  type BusinessContext,
} from "./business-context";

/**
 * Interview mechanics (context doc): 5 stages, server-driven; each user turn
 * runs extract-context-slice which may fill ANY slice — a rambling stage-2
 * answer that mentions a priority still lands in the right place. This
 * reducer is that merge, pure and order-stable.
 */

export const INTERVIEW_STAGES = [
  "company",
  "competitors",
  "positioning",
  "priorities",
  "delivery",
] as const;

export type InterviewStage = (typeof INTERVIEW_STAGES)[number];

export function nextStage(current: InterviewStage): InterviewStage | null {
  const i = INTERVIEW_STAGES.indexOf(current);
  return INTERVIEW_STAGES[i + 1] ?? null;
}

/**
 * Merge an extracted slice into the draft. Scalars/objects replace; list
 * slices append de-duplicated (the user adding a competitor in stage 4
 * must not erase stage-2 answers).
 */
export function mergeSlice(
  draft: BusinessContextDraft,
  slice: BusinessContextDraft,
): BusinessContextDraft {
  const valid = BusinessContextDraft.parse(slice);
  const out: BusinessContextDraft = { ...draft };

  if (valid.company) out.company = valid.company;
  if (valid.positioning) out.positioning = valid.positioning;
  if (valid.delivery) out.delivery = valid.delivery;
  if (valid.segments) {
    out.segments = dedupeBy(
      [...(draft.segments ?? []), ...valid.segments],
      (s) => s.name.toLowerCase(),
    );
  }
  if (valid.competitors) {
    out.competitors = dedupeBy(
      [...(draft.competitors ?? []), ...valid.competitors],
      (c) => c.entityId,
    );
  }
  if (valid.priorities) {
    out.priorities = dedupeBy(
      [...(draft.priorities ?? []), ...valid.priorities],
      (p) => p.text.toLowerCase(),
    );
  }
  if (valid.concerns) {
    out.concerns = dedupeBy(
      [...(draft.concerns ?? []), ...valid.concerns],
      (c) => c.text.toLowerCase(),
    );
  }
  return out;
}

/** Later entries win — a re-mention updates tier/notes rather than duping. */
function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const map = new Map<string, T>();
  for (const item of items) map.set(key(item), item);
  return [...map.values()];
}

/** What Activate still needs; empty = ready. Skipped stages surface here. */
export function missingForActivation(
  draft: BusinessContextDraft,
): Array<keyof BusinessContext> {
  const missing: Array<keyof BusinessContext> = [];
  if (!draft.company) missing.push("company");
  if (!draft.positioning) missing.push("positioning");
  if (!draft.competitors?.length) missing.push("competitors");
  if (!draft.priorities?.length) missing.push("priorities");
  if (!draft.delivery) missing.push("delivery");
  return missing;
}
