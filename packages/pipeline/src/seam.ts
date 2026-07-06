/**
 * The platform seam (jobs doc): CF `change.detect` triggers Trigger.dev
 * tasks over REST with an idempotency key; Trigger-side jobs publish to the
 * CF `embed` queue over the Queues HTTP API. Plain fetch both ways — neither
 * side imports the other's SDK, and this file is the ONLY place the seam's
 * wire format lives.
 */

const TRIGGER_API = () =>
  (process.env.TRIGGER_API_URL ?? "https://api.trigger.dev").replace(/\/$/, "");

export interface TriggerOptions {
  idempotencyKey: string;
  /** Per-org serialization (jobs doc convention #4). */
  orgId?: string;
  /** Defer execution (e.g. quiet-hours HIGH alerts). */
  delayUntil?: Date;
}

/**
 * REST-trigger a Trigger.dev task. Used by the CF worker (the seam proper)
 * and by web/server actions that kick per-org pipelines — anywhere the
 * Trigger SDK is out of bounds.
 */
export async function triggerTask(
  taskId: string,
  payload: unknown,
  opts: TriggerOptions,
): Promise<{ id: string }> {
  const key = process.env.TRIGGER_SECRET_KEY;
  if (!key) throw new Error("TRIGGER_SECRET_KEY is not set — cannot cross the seam");

  const res = await fetch(`${TRIGGER_API()}/api/v1/tasks/${taskId}/trigger`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      payload,
      options: {
        idempotencyKey: opts.idempotencyKey,
        ...(opts.orgId
          ? { concurrencyKey: opts.orgId, tags: [`org:${opts.orgId}`] }
          : {}),
        ...(opts.delayUntil ? { delay: opts.delayUntil.toISOString() } : {}),
      },
    }),
  });
  if (!res.ok) {
    throw new Error(
      `trigger ${taskId}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`,
    );
  }
  return (await res.json()) as { id: string };
}

export interface EmbedMessage {
  target: "change" | "signal";
  id: string;
}

/**
 * Publish to the CF `embed` queue over the Queues HTTP push API — the
 * reverse-seam path for Trigger-side jobs. The worker host overrides this
 * with its queue binding via configureEmbedPublisher (no HTTP hop).
 */
async function publishEmbedOverHttp(msg: EmbedMessage): Promise<void> {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const queueId = process.env.CF_EMBED_QUEUE_ID;
  if (!account || !token || !queueId) {
    // Embeddings are an enhancement (novelty dedup, Ask retrieval) — a
    // missing reverse seam must not fail signal/change persistence.
    console.error("embed publish skipped: CLOUDFLARE_ACCOUNT_ID/API_TOKEN/CF_EMBED_QUEUE_ID unset");
    return;
  }
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/queues/${queueId}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ body: msg, content_type: "json" }),
    },
  );
  if (!res.ok) {
    throw new Error(`embed queue publish: HTTP ${res.status} ${await res.text()}`);
  }
}

/**
 * Start a source.discover Workflow instance on the CF worker (Workflows REST
 * API) — how per-org flows (onboarding, context.enrich) kick global
 * discovery without importing anything CF.
 */
async function startDiscoveryOverHttp(entityId: string): Promise<void> {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !token) {
    console.error("source.discover skipped: CLOUDFLARE_ACCOUNT_ID/API_TOKEN unset");
    return;
  }
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/workflows/source-discover/instances`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ params: { entityId } }),
    },
  );
  if (!res.ok) {
    throw new Error(`source.discover start: HTTP ${res.status} ${await res.text()}`);
  }
}

let _startDiscovery: (entityId: string) => Promise<void> = startDiscoveryOverHttp;

/** Host override (the CF worker binds the Workflow directly). */
export function configureDiscoveryStarter(
  fn: (entityId: string) => Promise<void>,
): void {
  _startDiscovery = fn;
}

export function startDiscovery(entityId: string): Promise<void> {
  return _startDiscovery(entityId);
}

let _publishEmbed: (msg: EmbedMessage) => Promise<void> = publishEmbedOverHttp;

/** Host override (CF worker binds the queue directly). */
export function configureEmbedPublisher(
  fn: (msg: EmbedMessage) => Promise<void>,
): void {
  _publishEmbed = fn;
}

export function publishEmbed(msg: EmbedMessage): Promise<void> {
  return _publishEmbed(msg);
}
