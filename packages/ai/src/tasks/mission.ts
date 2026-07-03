import { z } from "zod";

import { confidence, signalCategory } from "@ayeastra/db";

import { validateCitations } from "../evidence";
import { ANALYST_TONE, CONFIDENCE_RUBRIC } from "../rubrics";
import { defineTask } from "../task";

/**
 * Phase 3.2 — Mission Room tasks. A mission is a standing question ("defend
 * against PayBridge"); these tasks expand it into a watch spec, keep its
 * brief fresh, and write the close-out retrospective. Feed filtering,
 * member handling, and cadence are code (@ayeastra/workflow) — the model
 * only plans and narrates, always inside a schema.
 */

// ── expand-mission: goal → watch spec (shown for edit, never auto-final) ──

export const ExpandMissionInput = z.object({
  goal: z.string().min(1),
  entities: z.array(z.object({ id: z.string(), name: z.string() })),
  priorities: z.array(z.object({ id: z.string(), text: z.string() })),
});

export const ExpandMissionOutput = z.object({
  /** Signal categories worth watching for this goal. */
  categories: z.array(z.enum(signalCategory.enumValues)).min(1).max(8),
  /** Concrete things to look for ("enterprise-tier pricing changes"). */
  lookFor: z.array(z.string().min(1)).min(2).max(8),
  /** Leading indicators that typically precede the outcome in question. */
  leadingIndicators: z.array(z.string().min(1)).min(1).max(6),
  /** Suggested KPI phrasings the owner can adopt or discard. */
  suggestedKpis: z.array(z.string()).max(4),
  /** Priority id when the goal clearly serves one, else null. */
  priorityId: z.string().nullable(),
});

export const expandMission = defineTask({
  name: "expand-mission",
  tier: "heavy",
  input: ExpandMissionInput,
  output: ExpandMissionOutput,
  prompt: (input) => ({
    system: `You turn a competitive-intelligence mission goal into a concrete watch specification.
${ANALYST_TONE}
Rules:
- categories come from the platform's fixed category vocabulary only.
- lookFor items are observable page/data changes, not vibes ("Enterprise tier repackaged" not "momentum").
- leadingIndicators are earlier, weaker signals that tend to precede the goal's decisive events.
- priorityId must be one of the provided priority ids, or null.
- This spec is a DRAFT the owner edits — be useful, not exhaustive.`,
    user: JSON.stringify(input),
  }),
  validate: (out, input) => {
    const known = new Set(input.priorities.map((p) => p.id));
    return out.priorityId && !known.has(out.priorityId)
      ? [`priorityId: unknown id "${out.priorityId}" — use a provided id or null`]
      : [];
  },
});

// ── mission-brief: cited synthesis of the room's current state ───────────

export const MissionBriefInput = z.object({
  goal: z.string(),
  watchSpec: z.object({
    lookFor: z.array(z.string()),
    leadingIndicators: z.array(z.string()),
  }),
  facts: z.array(
    z.object({
      ref: z.string(),
      text: z.string(),
      entity: z.string(),
      date: z.iso.date().nullable(),
    }),
  ),
  openActions: z.array(z.string()),
  qaNotes: z.array(z.string()).default([]),
});

export const MissionBriefOutput = z.object({
  /** Where things stand relative to the goal — one paragraph. */
  situation: z.object({ text: z.string().min(1), refs: z.array(z.string()).min(1) }),
  /** Recent developments, most consequential first. */
  developments: z
    .array(
      z.object({
        heading: z.string().nullable(),
        text: z.string().min(1),
        refs: z.array(z.string()).min(1),
      }),
    )
    .max(5),
  /** Forward view, hedged with confidence. */
  outlook: z.object({
    text: z.string().min(1),
    confidence: z.enum(confidence.enumValues),
  }),
});

export const missionBrief = defineTask({
  name: "mission-brief",
  tier: "heavy",
  input: MissionBriefInput,
  output: MissionBriefOutput,
  prompt: (input) => ({
    system: `You maintain the standing brief of a competitive-intelligence mission. The reader is the mission owner catching up.
${ANALYST_TONE}
${CONFIDENCE_RUBRIC}
Rules:
- Use ONLY the provided facts; situation and every development cite F-refs. No citable facts for a claim → omit the claim.
- Judge everything relative to the mission goal and its watch spec — this is a lens, not a general digest.
- Mention open actions only where a development changes their urgency.
- Numbers appear exactly as written in facts.`,
    user: JSON.stringify(input),
  }),
  validate: (out, input) =>
    validateCitations(
      { facts: input.facts.map((f) => ({ ref: f.ref, text: f.text, evidenceId: "" })) },
      [
        { label: "situation", refs: out.situation.refs },
        ...out.developments.map((d, i) => ({
          label: d.heading ?? `development ${i + 1}`,
          refs: d.refs,
        })),
      ],
    ),
});

// ── mission-retro: close-out retrospective (institutional memory) ────────

export const MissionRetroInput = z.object({
  goal: z.string(),
  openedAt: z.iso.date(),
  closedAt: z.iso.date(),
  facts: z.array(
    z.object({
      ref: z.string(),
      text: z.string(),
      entity: z.string(),
      date: z.iso.date().nullable(),
    }),
  ),
  actions: z.array(
    z.object({ description: z.string(), status: z.string(), outcome: z.string().nullable() }),
  ),
});

export const MissionRetroOutput = z.object({
  whatWeWatched: z.string().min(1),
  whatHappened: z.object({ text: z.string().min(1), refs: z.array(z.string()).min(1) }),
  actionsAndOutcomes: z.string().min(1),
  lessons: z.array(z.string()).max(4),
});

export const missionRetro = defineTask({
  name: "mission-retro",
  tier: "heavy",
  input: MissionRetroInput,
  output: MissionRetroOutput,
  prompt: (input) => ({
    system: `You write the close-out retrospective of a competitive-intelligence mission — institutional memory that must survive team turnover.
${ANALYST_TONE}
Rules:
- whatHappened uses ONLY the provided facts and cites F-refs; no citable facts → say plainly that little materialized.
- actionsAndOutcomes recaps the provided actions/outcomes verbatim in substance — never invent results.
- lessons are operational ("watch pricing pages weekly during a funding quarter"), not platitudes.`,
    user: JSON.stringify(input),
  }),
  validate: (out, input) =>
    validateCitations(
      { facts: input.facts.map((f) => ({ ref: f.ref, text: f.text, evidenceId: "" })) },
      [{ label: "whatHappened", refs: out.whatHappened.refs }],
    ),
});
