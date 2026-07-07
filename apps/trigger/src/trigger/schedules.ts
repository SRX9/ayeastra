import { schedules } from "@trigger.dev/sdk";
import { and, eq, isNull } from "drizzle-orm";

import { currentContext } from "@ayeastra/core";
import { businessContext, getDb, missions, scopedDb } from "@ayeastra/db";
import { isoWeek } from "@ayeastra/scoring";

import {
  boardAssembleTask,
  briefingWeeklyTask,
  digestDailyTask,
  fusionBacktestTask,
  fusionObserveTask,
  fusionScanTask,
  missionBriefTask,
} from "./tasks";

/**
 * Scheduling layer (jobs doc): per-org timezone schedules via
 * schedules.create (digest 08:00 org-TZ, briefing on the org's chosen day),
 * plus declarative crons for the global fusion/mission/board cadences.
 * schedule.sync upserts the per-org schedules daily (deduplicationKey makes
 * it idempotent) and on demand after onboarding.
 */

const BRIEFING_DOW: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
};

async function orgIds(): Promise<string[]> {
  const rows = await getDb()
    .selectDistinct({ orgId: businessContext.workosOrgId })
    .from(businessContext);
  return rows.map((r) => r.orgId);
}

/** Local calendar date (YYYY-MM-DD) in a timezone. */
function localDate(timezone: string, at: Date, offsetDays = 0): string {
  const shifted = new Date(at.getTime() + offsetDays * 86_400_000);
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(shifted);
  } catch {
    return shifted.toISOString().slice(0, 10);
  }
}

/** Upserts the two per-org schedules for every activated org. */
export const scheduleSync = schedules.task({
  id: "schedule.sync",
  cron: "0 4 * * *", // daily catch-up; also triggered right after activation
  run: async () => {
    for (const orgId of await orgIds()) {
      const context = await currentContext(scopedDb(orgId));
      if (!context) continue;
      const { timezone, briefingDay } = context.payload.delivery;

      await schedules.create({
        task: digestDailySchedule.id,
        cron: "0 8 * * *",
        timezone,
        externalId: orgId,
        deduplicationKey: `digest:${orgId}`,
      });
      await schedules.create({
        task: briefingWeeklySchedule.id,
        cron: `0 6 * * ${BRIEFING_DOW[briefingDay] ?? 1}`,
        timezone,
        externalId: orgId,
        deduplicationKey: `briefing:${orgId}`,
      });
    }
  },
});

export const digestDailySchedule = schedules.task({
  id: "digest.schedule",
  run: async (payload) => {
    const orgId = payload.externalId;
    if (!orgId) return;
    const day = localDate(payload.timezone, payload.timestamp);
    await digestDailyTask.trigger(
      { orgId, day },
      { idempotencyKey: `digest:${orgId}:${day}`, concurrencyKey: orgId, tags: [`org:${orgId}`] },
    );
  },
});

export const briefingWeeklySchedule = schedules.task({
  id: "briefing.schedule",
  run: async (payload) => {
    const orgId = payload.externalId;
    if (!orgId) return;
    // The briefing covers the 7 days ending yesterday — periodStart is one
    // week back in the org's local calendar.
    const periodStart = localDate(payload.timezone, payload.timestamp, -7);
    await briefingWeeklyTask.trigger(
      { orgId, periodStart },
      {
        idempotencyKey: `briefing:${orgId}:${periodStart}`,
        concurrencyKey: orgId,
        tags: [`org:${orgId}`],
      },
    );
  },
});

/** fusion.observe (global) then fusion.scan per org — daily. */
export const fusionDailySchedule = schedules.task({
  id: "fusion.daily",
  cron: { pattern: "17 3 * * *", timezone: "UTC" },
  run: async (payload) => {
    const day = payload.timestamp.toISOString().slice(0, 10);
    await fusionObserveTask.triggerAndWait(
      { day },
      { idempotencyKey: `fusion.observe:${day}` },
    );
    for (const orgId of await orgIds()) {
      await fusionScanTask.trigger(
        { orgId, day },
        { idempotencyKey: `fusion.scan:${orgId}:${day}`, concurrencyKey: orgId, tags: [`org:${orgId}`] },
      );
    }
  },
});

export const fusionBacktestSchedule = schedules.task({
  id: "fusion.backtest.weekly",
  cron: { pattern: "43 4 * * 1", timezone: "UTC" },
  run: async (payload) => {
    const week = isoWeek(payload.timestamp);
    await fusionBacktestTask.trigger({ week }, { idempotencyKey: `fusion.backtest:${week}` });
  },
});

/** Weekly refresh for every active mission (3.2). */
export const missionBriefSchedule = schedules.task({
  id: "mission.brief.weekly",
  cron: { pattern: "0 5 * * 1", timezone: "UTC" },
  run: async (payload) => {
    const day = payload.timestamp.toISOString().slice(0, 10);
    const db = getDb();
    for (const orgId of await orgIds()) {
      const active = await db
        .select({ id: missions.id })
        .from(missions)
        .where(and(eq(missions.workosOrgId, orgId), eq(missions.status, "active"), isNull(missions.closedAt)));
      for (const m of active) {
        await missionBriefTask.trigger(
          { orgId, missionId: m.id, day },
          { idempotencyKey: `mission.brief:${m.id}:${day}`, concurrencyKey: orgId, tags: [`org:${orgId}`] },
        );
      }
    }
  },
});

/** Board Mode artifact — first day of each quarter, covering the previous. */
export const boardQuarterlySchedule = schedules.task({
  id: "board.quarterly",
  cron: { pattern: "0 7 1 1,4,7,10 *", timezone: "UTC" },
  run: async (payload) => {
    const at = payload.timestamp;
    const q = Math.floor(at.getUTCMonth() / 3); // 0-based current quarter
    const prevQ = q === 0 ? 4 : q;
    const year = q === 0 ? at.getUTCFullYear() - 1 : at.getUTCFullYear();
    const quarter = `${year}-Q${prevQ}`;
    for (const orgId of await orgIds()) {
      await boardAssembleTask.trigger(
        { orgId, quarter },
        { idempotencyKey: `board.assemble:${orgId}:${quarter}`, concurrencyKey: orgId, tags: [`org:${orgId}`] },
      );
    }
  },
});
