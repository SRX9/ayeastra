import { tool } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";

import {
  actions,
  briefings,
  getDb,
  missions,
  reports,
  type ScopedDb,
} from "@ayeastra/db";

import { listWatched } from "../org";
import type { AstraSource } from "../registry";

/**
 * Org artifacts source — structured lookups over the intelligence layer's
 * finished products. Pure scoped selects, zero LLM cost. List tools return
 * light rows; get tools return the full document for one id.
 */

const LIST_LIMIT = 20;

function clip(value: unknown, max = 6000): unknown {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.length <= max) return value;
  return `${text.slice(0, max)}… [truncated]`;
}

async function byId<T extends { id: string }>(
  rows: Promise<T[]>,
): Promise<T | { status: "not_found" }> {
  const [row] = await rows;
  return row ?? { status: "not_found" };
}

const idInput = z.object({ id: z.uuid() });

export const orgArtifactsSource: AstraSource = {
  key: "org-artifacts",
  title: "Workspace artifacts",
  description:
    "The org's briefings, missions, reports, open actions, and watched companies — list and fetch by id. Use when the user asks about 'my briefings / missions / reports / actions' or what is being watched.",

  tools(ctx) {
    const scoped: ScopedDb = ctx.scoped;
    return {
      list_watched_entities: tool({
        description:
          "List the companies this org watches (name + known aliases).",
        inputSchema: z.object({}),
        execute: async () => ({
          entities: (await listWatched(scoped, getDb())).map((w) => ({
            name: w.name,
            aliases: w.aliases,
          })),
        }),
      }),

      list_briefings: tool({
        description:
          "List recent briefings (weekly/baseline/dossier/board) with period and status.",
        inputSchema: z.object({}),
        execute: async () => {
          const rows = await scoped.select(briefings);
          return {
            briefings: rows
              .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
              .slice(0, LIST_LIMIT)
              .map((b) => ({
                id: b.id,
                kind: b.kind,
                periodStart: b.periodStart,
                periodEnd: b.periodEnd,
                status: b.status,
              })),
          };
        },
      }),

      get_briefing: tool({
        description: "Fetch one briefing's sections by id.",
        inputSchema: idInput,
        execute: async ({ id }) => {
          const row = await byId(scoped.select(briefings, eq(briefings.id, id)));
          if ("status" in row && row.status === "not_found") return row;
          const b = row as typeof briefings.$inferSelect;
          return {
            id: b.id,
            kind: b.kind,
            periodStart: b.periodStart,
            periodEnd: b.periodEnd,
            status: b.status,
            sections: clip(b.sections),
          };
        },
      }),

      list_missions: tool({
        description: "List the org's missions (standing goals) with status.",
        inputSchema: z.object({}),
        execute: async () => {
          const rows = await scoped.select(missions);
          return {
            missions: rows
              .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
              .slice(0, LIST_LIMIT)
              .map((m) => ({ id: m.id, goal: m.goal, status: m.status })),
          };
        },
      }),

      get_mission: tool({
        description:
          "Fetch one mission by id — goal, KPIs, latest brief, retrospective.",
        inputSchema: idInput,
        execute: async ({ id }) => {
          const row = await byId(scoped.select(missions, eq(missions.id, id)));
          if ("status" in row && row.status === "not_found") return row;
          const m = row as typeof missions.$inferSelect;
          return {
            id: m.id,
            goal: m.goal,
            status: m.status,
            kpis: m.kpis,
            brief: clip(m.brief),
            retrospective: clip(m.retrospective),
          };
        },
      }),

      list_reports: tool({
        description: "List the org's saved reports (title + last update).",
        inputSchema: z.object({}),
        execute: async () => {
          const rows = await scoped.select(reports);
          return {
            reports: rows
              .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
              .slice(0, LIST_LIMIT)
              .map((r) => ({
                id: r.id,
                title: r.title,
                updatedAt: r.updatedAt.toISOString().slice(0, 10),
              })),
          };
        },
      }),

      get_report: tool({
        description: "Fetch one report's layout blocks by id.",
        inputSchema: idInput,
        execute: async ({ id }) => {
          const row = await byId(scoped.select(reports, eq(reports.id, id)));
          if ("status" in row && row.status === "not_found") return row;
          const r = row as typeof reports.$inferSelect;
          return { id: r.id, title: r.title, layout: clip(r.layout) };
        },
      }),

      list_actions: tool({
        description: "List the org's tracked actions, optionally by status.",
        inputSchema: z.object({
          status: z.enum(["open", "done", "dropped"]).optional(),
        }),
        execute: async ({ status }) => {
          const rows = await scoped.select(
            actions,
            status ? eq(actions.status, status) : undefined,
          );
          return {
            actions: rows
              .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
              .slice(0, LIST_LIMIT)
              .map((a) => ({
                id: a.id,
                description: a.description,
                status: a.status,
                dueDate: a.dueDate,
              })),
          };
        },
      }),
    };
  },
};
