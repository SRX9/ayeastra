import type {
  ExecutionContext,
  MessageBatch,
  ScheduledController,
} from "@cloudflare/workers-types";

import { writeDeadLetter, type JobDef } from "@ayeastra/jobs";
import { createDeadLetterConsumer, createQueueConsumer } from "@ayeastra/jobs/cf";
import {
  changeDetect,
  embedUpsert,
  schedulerTick,
  sourceFetch,
} from "@ayeastra/pipeline";

import { bootstrap, type Env } from "./env";
import { withDomainLease } from "./semaphore";

export { DomainSemaphore } from "./semaphore";
export { SourceDiscoverWorkflow } from "./discover";

/**
 * The global-observation host (jobs doc): cron tick fans out due sources;
 * queue consumers run the pipeline jobs through the shared CF adapter
 * (payload validation, backoff, DLQ); DLQ consumers write job_dead_letters.
 */

/** source.fetch wrapped with the per-domain politeness lease — the one
 * platform concern the platform-neutral job can't own. */
function politeSourceFetch(env: Env): JobDef<(typeof sourceFetch)["payload"]> {
  return {
    ...sourceFetch,
    run: async (payload, ctx) => {
      const { getDb, sources } = await import("@ayeastra/db");
      const { eq } = await import("drizzle-orm");
      const [source] = await getDb()
        .select({ url: sources.url })
        .from(sources)
        .where(eq(sources.id, payload.sourceId));
      if (!source) return;
      await withDomainLease(env.DOMAIN_SEMAPHORE, source.url, () =>
        sourceFetch.run(payload, ctx),
      );
    },
  };
}

export default {
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    bootstrap(env);
    const payload = { tickAt: new Date(controller.scheduledTime).toISOString() };
    try {
      await schedulerTick.run(payload, {
        jobRunId: `cron:${controller.scheduledTime}`,
        attempt: 1,
      });
    } catch (err) {
      // Cron has no queue retry — a failed tick self-heals next tick, but the
      // failure is recorded (convention #3), never silent.
      await writeDeadLetter(schedulerTick.name, payload, String(err));
    }
  },

  async queue(batch: MessageBatch<unknown>, env: Env, _ctx: ExecutionContext): Promise<void> {
    bootstrap(env);
    switch (batch.queue) {
      case "ayeastra-fetch":
        return createQueueConsumer(politeSourceFetch(env))(batch);
      case "ayeastra-detect":
        return createQueueConsumer(changeDetect)(batch);
      case "ayeastra-embed":
        return createQueueConsumer(embedUpsert)(batch);
      case "ayeastra-fetch-dlq":
        return createDeadLetterConsumer(sourceFetch.name)(batch);
      case "ayeastra-detect-dlq":
        return createDeadLetterConsumer(changeDetect.name)(batch);
      case "ayeastra-embed-dlq":
        return createDeadLetterConsumer(embedUpsert.name)(batch);
      default:
        throw new Error(`unknown queue: ${batch.queue}`);
    }
  },

  async fetch(_req: Request, env: Env): Promise<Response> {
    bootstrap(env);
    return new Response("ayeastra-worker ok", { status: 200 });
  },
};
