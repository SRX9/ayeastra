import { and, eq, gte, isNotNull } from "drizzle-orm";
import { z } from "zod";

import { currentContext } from "@ayeastra/core";
import { deliveries, getDb, orgModules, scopedDb, signals } from "@ayeastra/db";
import { FAMILY_DEDUP_HOURS, routeSignal } from "@ayeastra/delivery";
import { defineJob } from "@ayeastra/jobs";
import { activeModuleKeys } from "@ayeastra/modules";

import { triggerTask } from "../seam";

/**
 * signal.route (alerts doc) — after every signal persist: routing-matrix
 * guards in order (config → quiet hours → family dedup → mutes → module
 * gate) → deliveries rows → delivery.send. Sends are driven off the
 * deliveries table only; digest/briefing routes write nothing here.
 */

export const signalRoute = defineJob({
  name: "signal.route",
  payload: z.object({ orgId: z.string().min(1), signalId: z.uuid() }),
  idempotencyKey: (p) => `route:${p.signalId}`,
  run: async (payload) => {
    const db = getDb();
    const scoped = scopedDb(payload.orgId, db);

    const [signal] = await scoped.select(signals, eq(signals.id, payload.signalId));
    if (!signal) return;
    const context = await currentContext(scoped);
    if (!context) return;
    const delivery = context.payload.delivery;

    // Replay guard: this signal already has delivery rows.
    const existing = await scoped.select(
      deliveries,
      and(eq(deliveries.targetType, "alert"), eq(deliveries.targetId, signal.id)),
    );
    if (existing.length > 0) return;

    // Family dedup window: immediate alerts sent for the same entity+category
    // in the trailing 24h (join through signals for entity/category).
    const windowStart = new Date(Date.now() - FAMILY_DEDUP_HOURS * 3_600_000);
    const recentRows = await db
      .select({ entityId: signals.entityId, category: signals.category, sentAt: deliveries.sentAt })
      .from(deliveries)
      .innerJoin(signals, eq(deliveries.targetId, signals.id))
      .where(
        and(
          scoped.scope(deliveries),
          eq(deliveries.targetType, "alert"),
          isNotNull(deliveries.sentAt),
          gte(deliveries.sentAt, windowStart),
        ),
      );

    const moduleRows = await scoped.select(orgModules);
    const now = new Date();
    const decision = routeSignal({
      signal: {
        id: signal.id,
        entityId: signal.entityId,
        category: signal.category,
        moduleKey: signal.moduleKey,
        severity: signal.severity,
      },
      config: {
        channels: delivery.alertRouting,
        quietHours: null, // quiet-hours config lands with Settings; null = no hold
        timezone: delivery.timezone,
      },
      now,
      recentAlerts: recentRows.map((r) => ({
        entityId: r.entityId,
        category: r.category,
        sentAt: r.sentAt!,
      })),
      mutes: [], // per-user mute rules land with the mute-offer Settings flow
      localHour: localHourIn(delivery.timezone, now),
      activeModules: activeModuleKeys(moduleRows),
    });
    if (decision.kind !== "immediate") return;

    for (const channel of decision.channels) {
      const [row] = await scoped
        .insert(deliveries, {
          channel,
          targetType: "alert",
          targetId: signal.id,
          status: "queued",
        })
        .returning({ id: deliveries.id });
      await triggerTask(
        "delivery.send",
        { orgId: payload.orgId, deliveryId: row!.id },
        {
          idempotencyKey: `deliver:${row!.id}`,
          orgId: payload.orgId,
          delayUntil: decision.deferUntil ?? undefined,
        },
      );
    }
  },
});

export function localHourIn(timezone: string, now: Date): number {
  try {
    return Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "numeric",
        hour12: false,
      }).format(now),
    );
  } catch {
    return now.getUTCHours();
  }
}

