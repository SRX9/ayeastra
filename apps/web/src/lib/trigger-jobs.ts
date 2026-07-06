/**
 * Fire-and-forget REST triggers into the Trigger.dev app (jobs doc seam:
 * plain HTTP, no vendor SDK in the web app). Credential-gated: without
 * TRIGGER_SECRET_KEY these log and no-op, so onboarding never breaks while
 * the jobs platform is unprovisioned.
 */

async function triggerJob(
  taskId: string,
  payload: unknown,
  idempotencyKey: string,
  orgId?: string,
): Promise<void> {
  const key = process.env.TRIGGER_SECRET_KEY;
  if (!key) {
    console.warn(`trigger ${taskId} skipped: TRIGGER_SECRET_KEY unset`);
    return;
  }
  const base = (process.env.TRIGGER_API_URL ?? "https://api.trigger.dev").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/v1/tasks/${taskId}/trigger`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        payload,
        options: {
          idempotencyKey,
          ...(orgId ? { concurrencyKey: orgId, tags: [`org:${orgId}`] } : {}),
        },
      }),
    });
    if (!res.ok) console.error(`trigger ${taskId}: HTTP ${res.status} ${await res.text()}`);
  } catch (err) {
    console.error(`trigger ${taskId} failed`, err);
  }
}

/** Plan activated (first context version): source discovery for the watched
 * entities. The Baseline Dossier (<24h SLA) is fired by context.enrich the
 * first time it sees a watched entity — never directly from here, where an
 * entity-less activation would consume the once-ever baseline key on an
 * empty dossier. The per-org digest/briefing schedules follow via the daily
 * schedule.sync task. */
export async function onPlanActivated(orgId: string): Promise<void> {
  await triggerJob(
    "context.enrich",
    { orgId },
    `enrich:${orgId}:${new Date().toISOString().slice(0, 10)}`,
    orgId,
  );
}

/** Context edited after activation: re-run enrichment to fill source gaps. */
export async function onContextUpdated(orgId: string): Promise<void> {
  await triggerJob(
    "context.enrich",
    { orgId },
    `enrich:${orgId}:${new Date().toISOString().slice(0, 10)}`,
    orgId,
  );
}

/** Mission closed: write the retrospective (institutional memory, 3.2). */
export async function onMissionClosed(orgId: string, missionId: string): Promise<void> {
  await triggerJob("mission.retro", { orgId, missionId }, `mission.retro:${missionId}`, orgId);
}
