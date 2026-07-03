import { confidence, signalCategory } from "@ayeastra/db";
import { z } from "zod";

/**
 * Mission Rooms (3.2): a mission is a standing question that filters the
 * entire engine through its lens. Nothing here is a new pipeline — pure
 * lenses over signals/actions that already exist. jsonb is never trusted:
 * specs and briefs are parsed on every read.
 */

export const watchSpecSchema = z.object({
  v: z.literal(1),
  categories: z.array(z.enum(signalCategory.enumValues)).min(1),
  lookFor: z.array(z.string()).default([]),
  leadingIndicators: z.array(z.string()).default([]),
});
export type WatchSpec = z.output<typeof watchSpecSchema>;

export function parseWatchSpec(raw: unknown): WatchSpec | null {
  const r = watchSpecSchema.safeParse(raw);
  return r.success ? r.data : null;
}

export const missionBriefSchema = z.object({
  v: z.literal(1),
  situation: z.object({ text: z.string(), refs: z.array(z.string()) }),
  developments: z.array(
    z.object({
      heading: z.string().nullable(),
      text: z.string(),
      refs: z.array(z.string()),
    }),
  ),
  outlook: z.object({
    text: z.string(),
    // Derived from the db enum so this parse can't silently drift from the
    // AI task's output schema (which uses the same enumValues).
    confidence: z.enum(confidence.enumValues),
  }),
  /** F-ref → evidence chip, so the room renders citations like briefings. */
  citations: z.record(
    z.string(),
    z.object({ evidenceId: z.string(), sourceUrl: z.string().nullable() }),
  ),
  updatedAt: z.iso.datetime(),
});
export type MissionBriefStored = z.output<typeof missionBriefSchema>;

export function parseMissionBrief(raw: unknown): MissionBriefStored | null {
  const r = missionBriefSchema.safeParse(raw);
  return r.success ? r.data : null;
}

export const missionRetroSchema = z.object({
  v: z.literal(1),
  whatWeWatched: z.string(),
  whatHappened: z.object({ text: z.string(), refs: z.array(z.string()) }),
  actionsAndOutcomes: z.string(),
  lessons: z.array(z.string()),
  citations: z.record(
    z.string(),
    z.object({ evidenceId: z.string(), sourceUrl: z.string().nullable() }),
  ),
  closedAt: z.iso.datetime(),
});
export type MissionRetroStored = z.output<typeof missionRetroSchema>;

export interface MissionLens {
  entityIds: string[];
  watchSpec: WatchSpec | null;
  priorityId: string | null;
}

export interface RelatableSignal {
  entityId: string;
  category: string;
  priorityAttachments: unknown;
}

/**
 * Mission relevance (the room's feed filter): a signal belongs when it is
 * on a mission entity in a watched category, OR when it attaches to the
 * mission's linked priority (grounding attachment) from any entity.
 */
export function missionRelevant(lens: MissionLens, s: RelatableSignal): boolean {
  const entityMatch =
    lens.entityIds.includes(s.entityId) &&
    (lens.watchSpec === null ||
      lens.watchSpec.categories.includes(
        s.category as WatchSpec["categories"][number],
      ));
  if (entityMatch) return true;
  if (!lens.priorityId || !Array.isArray(s.priorityAttachments)) return false;
  return s.priorityAttachments.some(
    (a) =>
      typeof a === "object" &&
      a !== null &&
      (a as { priorityId?: string }).priorityId === lens.priorityId,
  );
}

/** draft → active → closed; nothing else (missions are not a PM tool). */
export function canTransitionMission(
  from: "draft" | "active" | "closed",
  to: "draft" | "active" | "closed",
): boolean {
  return (from === "draft" && to === "active") || (from === "active" && to === "closed");
}
