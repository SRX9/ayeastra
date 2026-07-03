import { z } from "zod";

/**
 * The vendor-independent job contract (jobs doc §Conventions). Every
 * background step — CF firehose or Trigger.dev pipeline — is a JobDef;
 * the adapters in ./adapters wrap it for their platform. No vendor SDK
 * escapes this package.
 */

export interface JobContext {
  /** Queues message ID / Trigger run ID — propagates to Langfuse + cost_events. */
  jobRunId: string;
  /** 1-based. */
  attempt: number;
}

export interface JobDef<P extends z.ZodType = z.ZodType> {
  /** e.g. "source.fetch" — also the dead-letter + tracing key. */
  name: string;
  /** Convention #1: payloads are IDs, never blobs. */
  payload: P;
  /** Convention #2: derived from the natural work unit; duplicates are no-ops. */
  idempotencyKey: (payload: z.output<P>) => string;
  /** Convention #3: default 3. */
  maxAttempts?: number;
  /** Convention #5: > 600s must be decomposed into steps. */
  timeoutSeconds?: number;
  run: (payload: z.output<P>, ctx: JobContext) => Promise<void>;
}

export const JOB_DEFAULTS = { maxAttempts: 3, timeoutSeconds: 600 } as const;

export function defineJob<P extends z.ZodType>(def: JobDef<P>): JobDef<P> {
  if (!/^[a-z]+(\.[a-z_]+)+$/.test(def.name)) {
    throw new Error(`job name must be dot-namespaced lowercase: "${def.name}"`);
  }
  const timeout = def.timeoutSeconds ?? JOB_DEFAULTS.timeoutSeconds;
  if (timeout > 600) {
    throw new Error(
      `${def.name}: timeout ${timeout}s exceeds 10 min — decompose into child tasks / workflow steps`,
    );
  }
  return Object.freeze({ ...def });
}

/** Exponential backoff + jitter (convention #3), in seconds. */
export function backoffSeconds(attempt: number): number {
  const base = Math.min(2 ** attempt * 15, 900);
  return Math.round(base / 2 + Math.random() * (base / 2));
}

/** Hour bucket for scheduled-work idempotency keys: fetch:{sourceId}:{bucket}. */
export function hourBucket(date: Date = new Date()): string {
  return date.toISOString().slice(0, 13);
}
