import { Langfuse } from "langfuse";

import { costEvents, getDb } from "@ayeastra/db";

import type { Tier } from "./client";

/**
 * Observability contract (doc 1.13): every runTask emits one Langfuse
 * generation and one cost_events row. Telemetry failures are loud in logs
 * but never fail the inference call itself.
 */

export interface RunContext {
  orgId?: string;
  sourceId?: string;
  jobRunId?: string;
  entityId?: string;
}

let _langfuse: Langfuse | null | undefined;

function getLangfuse(): Langfuse | null {
  if (_langfuse === undefined) {
    _langfuse =
      process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY
        ? new Langfuse({
            secretKey: process.env.LANGFUSE_SECRET_KEY,
            publicKey: process.env.LANGFUSE_PUBLIC_KEY,
            baseUrl: process.env.LANGFUSE_BASE_URL,
          })
        : null;
  }
  return _langfuse;
}

export interface TaskRunRecord {
  taskName: string;
  tier: Tier | "embedding";
  model: string;
  ctx: RunContext;
  input: unknown;
  output: unknown;
  error?: string;
  usage: { inputTokens: number; outputTokens: number };
  costUsd: number;
  priced: boolean;
  attempts: number;
  startedAt: Date;
}

export async function recordTaskRun(r: TaskRunRecord): Promise<void> {
  try {
    getLangfuse()?.generation({
      traceId: r.ctx.jobRunId,
      name: r.taskName,
      model: r.model,
      input: r.input,
      output: r.error ? { error: r.error } : r.output,
      usage: { input: r.usage.inputTokens, output: r.usage.outputTokens },
      startTime: r.startedAt,
      endTime: new Date(),
      level: r.error ? "ERROR" : "DEFAULT",
      metadata: {
        tier: r.tier,
        attempts: r.attempts,
        org: r.ctx.orgId,
        source: r.ctx.sourceId,
        entity: r.ctx.entityId,
        costUsd: r.costUsd,
      },
    });
  } catch (err) {
    console.error("packages/ai: langfuse emission failed", err);
  }

  try {
    await getDb()
      .insert(costEvents)
      .values({
        vendor: "openai",
        taskName: r.taskName,
        units: r.usage.inputTokens + r.usage.outputTokens,
        costUsd: r.costUsd.toFixed(6),
        workosOrgId: r.ctx.orgId,
        sourceId: r.ctx.sourceId,
        jobRunId: r.ctx.jobRunId,
        meta: {
          model: r.model,
          tier: r.tier,
          inputTokens: r.usage.inputTokens,
          outputTokens: r.usage.outputTokens,
          priced: r.priced,
          attempts: r.attempts,
          ...(r.error ? { error: r.error } : {}),
        },
      });
  } catch (err) {
    console.error("packages/ai: cost_events emission failed", err);
  }
}

/** Call before process exit in short-lived jobs so traces aren't dropped. */
export async function flushTracing(): Promise<void> {
  await getLangfuse()?.flushAsync();
}
