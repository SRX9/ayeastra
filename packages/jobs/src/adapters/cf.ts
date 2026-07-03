import type { MessageBatch } from "@cloudflare/workers-types";

import { backoffSeconds, type JobDef } from "../contract";
import { writeDeadLetter } from "../dead-letter";

/**
 * Cloudflare adapter: wraps a JobDef as a Queues consumer handler.
 * Retry/DLQ mechanics stay native (queue max_retries + dead_letter_queue in
 * wrangler config must match def.maxAttempts); this wrapper adds payload
 * validation, backoff, and the shared JobContext.
 */
export function createQueueConsumer<P extends JobDef["payload"]>(
  job: JobDef<P>,
) {
  return async (batch: MessageBatch<unknown>): Promise<void> => {
    for (const msg of batch.messages) {
      const parsed = job.payload.safeParse(msg.body);
      if (!parsed.success) {
        // Malformed payloads never succeed on retry — dead-letter directly.
        await writeDeadLetter(
          job.name,
          msg.body,
          `invalid payload: ${parsed.error.message}`,
        );
        msg.ack();
        continue;
      }
      try {
        await job.run(parsed.data, {
          jobRunId: msg.id,
          attempt: msg.attempts,
        });
        msg.ack();
      } catch (err) {
        console.error(`${job.name} attempt ${msg.attempts} failed`, err);
        msg.retry({ delaySeconds: backoffSeconds(msg.attempts) });
      }
    }
  };
}

/**
 * DLQ consumer: Queues moved a message past max_retries — record it and
 * alert (jobs doc convention #3). Bind one per dead-letter queue.
 */
export function createDeadLetterConsumer(jobName: string) {
  return async (batch: MessageBatch<unknown>): Promise<void> => {
    for (const msg of batch.messages) {
      await writeDeadLetter(
        jobName,
        msg.body,
        `exhausted ${msg.attempts} attempts (queue DLQ)`,
      );
      msg.ack();
    }
  };
}
