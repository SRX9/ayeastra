import { task } from "@trigger.dev/sdk";

import { JOB_DEFAULTS, type JobDef } from "../contract";
import { writeDeadLetter } from "../dead-letter";

/**
 * Trigger.dev adapter: wraps a JobDef as a task for the intelligence-layer
 * pipelines. Callers trigger with the def's idempotency key and an org
 * concurrencyKey (jobs doc convention #4) — helper below builds the options.
 */
export function toTriggerTask<P extends JobDef["payload"]>(job: JobDef<P>) {
  return task({
    id: job.name,
    maxDuration: job.timeoutSeconds ?? JOB_DEFAULTS.timeoutSeconds,
    retry: {
      maxAttempts: job.maxAttempts ?? JOB_DEFAULTS.maxAttempts,
      factor: 2,
      minTimeoutInMs: 15_000,
      maxTimeoutInMs: 900_000,
      randomize: true,
    },
    run: async (payload: unknown, { ctx }) => {
      const parsed = job.payload.safeParse(payload);
      if (!parsed.success) {
        await writeDeadLetter(
          job.name,
          payload,
          `invalid payload: ${parsed.error.message}`,
        );
        throw new Error(`${job.name}: invalid payload — dead-lettered`);
      }
      await job.run(parsed.data, {
        jobRunId: ctx.run.id,
        attempt: ctx.attempt.number,
      });
    },
    onFailure: async ({ payload, error }) => {
      await writeDeadLetter(job.name, payload, String(error));
    },
  });
}

/** Standard trigger options: seam idempotency + per-org serialization. */
export function triggerOptions(
  job: JobDef,
  payload: unknown,
  orgId?: string,
) {
  return {
    idempotencyKey: job.idempotencyKey(job.payload.parse(payload)),
    ...(orgId ? { concurrencyKey: orgId } : {}),
    tags: orgId ? [`org:${orgId}`] : [],
  };
}
