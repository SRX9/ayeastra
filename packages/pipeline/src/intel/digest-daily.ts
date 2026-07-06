import { and, eq, gte, lt } from "drizzle-orm";
import { z } from "zod";

import { currentContext } from "@ayeastra/core";
import { deliveries, getDb, orgModules, scopedDb, signals } from "@ayeastra/db";
import { defineJob } from "@ayeastra/jobs";
import { activeModuleKeys, isModuleActive } from "@ayeastra/modules";

import { triggerTask } from "../seam";

/**
 * digest.daily (alerts doc) — per-org 08:00 org-TZ: NOTABLE signals of the
 * trailing day batch into one artifact; deliveries rows carry the signal IDs
 * in meta and delivery.send renders from the rows. INFO stays briefing-only.
 */

export const digestDaily = defineJob({
  name: "digest.daily",
  payload: z.object({
    orgId: z.string().min(1),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  idempotencyKey: (p) => `digest:${p.orgId}:${p.day}`,
  run: async (payload) => {
    const db = getDb();
    const scoped = scopedDb(payload.orgId, db);
    const context = await currentContext(scoped);
    if (!context) return;
    const delivery = context.payload.delivery;

    // Replay guard: this day already has digest rows.
    const dayEnd = new Date(`${payload.day}T23:59:59Z`);
    const dayStart = new Date(dayEnd.getTime() - 24 * 3_600_000);
    const existing = await scoped.select(deliveries, eq(deliveries.targetType, "digest"));
    if (existing.some((d) => (d.meta as { day?: string } | null)?.day === payload.day)) return;

    const active = activeModuleKeys(await scoped.select(orgModules));
    const rows = await scoped.select(
      signals,
      and(
        eq(signals.severity, "notable"),
        gte(signals.createdAt, dayStart),
        lt(signals.createdAt, dayEnd),
      ),
    );
    const digestSignals = rows.filter((s) => isModuleActive(s.moduleKey, active));
    if (digestSignals.length === 0) return; // quiet day — no empty digest

    // Digest channels: the notable route if configured, else email.
    const channels =
      delivery.alertRouting.notable.length > 0 ? delivery.alertRouting.notable : (["email"] as const);
    const meta = { day: payload.day, signalIds: digestSignals.map((s) => s.id) };

    for (const channel of channels) {
      const [row] = await scoped
        .insert(deliveries, {
          channel,
          targetType: "digest",
          // The digest has no artifact row of its own; the anchor signal id
          // keeps targetId meaningful while meta.signalIds carries the set.
          targetId: digestSignals[0]!.id,
          status: "queued",
          meta,
        })
        .returning({ id: deliveries.id });
      await triggerTask(
        "delivery.send",
        { orgId: payload.orgId, deliveryId: row!.id },
        { idempotencyKey: `deliver:${row!.id}`, orgId: payload.orgId },
      );
    }
  },
});
