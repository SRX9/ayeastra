import type OpenAI from "openai";
import { z } from "zod";

import { costUsd, getLlm, type Tier } from "./client";
import { recordTaskRun, type RunContext } from "./tracing";

/**
 * defineTask — the only public API for running inference (ai-platform doc).
 * Zod-validated input and output; one repair attempt on validation failure;
 * partial or coerced output never escapes the package.
 */

export class TaskInputError extends Error {
  constructor(taskName: string, cause: z.ZodError) {
    super(`${taskName}: invalid input — ${z.prettifyError(cause)}`);
    this.name = "TaskInputError";
  }
}

export class TaskOutputError extends Error {
  constructor(
    taskName: string,
    public readonly issues: string[],
  ) {
    super(`${taskName}: output failed validation after repair — ${issues.join("; ")}`);
    this.name = "TaskOutputError";
  }
}

export interface TaskDef<I extends z.ZodType, O extends z.ZodType> {
  /** Langfuse + cost_events key. */
  name: string;
  tier: Tier;
  input: I;
  output: O;
  prompt: (input: z.output<I>) => { system: string; user: string };
  /** Repair attempts after the first failed parse. Default 1. */
  maxRetries?: number;
  maxOutputTokens?: number;
  /**
   * Post-parse checks the schema can't express (e.g. evidence citation
   * validation). Returned issues trigger the same repair loop.
   */
  validate?: (output: z.output<O>, input: z.output<I>) => string[];
}

export interface Task<I extends z.ZodType, O extends z.ZodType>
  extends TaskDef<I, O> {
  run: (input: z.input<I>, ctx?: RunContext) => Promise<z.output<O>>;
}

export function defineTask<I extends z.ZodType, O extends z.ZodType>(
  def: TaskDef<I, O>,
): Task<I, O> {
  return { ...def, run: (input, ctx = {}) => runTask(def, input, ctx) };
}

/** Models wrap JSON in code fences often enough to strip them defensively. */
function extractJson(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  return (fenced ? fenced[1]! : text).trim();
}

/**
 * Per-process capability memory. A 400 teaches us the endpoint's dialect
 * once; without this every task run re-pays a failed round trip.
 * - json_schema: strict structured outputs (OpenAI, some gateways)
 * - max_completion_tokens: required by reasoning models (gpt-5/o-series),
 *   which reject the legacy max_tokens; older gateways only know max_tokens.
 */
const endpointCaps = {
  jsonSchema: true,
  tokenParam: "max_completion_tokens" as "max_completion_tokens" | "max_tokens",
};

/**
 * Reasoning models (gpt-5/o-series) spend completion tokens on hidden
 * reasoning before emitting any visible JSON, so a cap sized only for the
 * answer truncates them into empty content — and the repair loop retries
 * with the same cap, guaranteeing failure. Each task's maxOutputTokens stays
 * the *answer* budget; this fixed allowance covers the reasoning overhead
 * while still bounding runaway cost.
 */
const REASONING_ALLOWANCE = 2000;

async function runTask<I extends z.ZodType, O extends z.ZodType>(
  def: TaskDef<I, O>,
  rawInput: z.input<I>,
  ctx: RunContext,
): Promise<z.output<O>> {
  const parsedInput = def.input.safeParse(rawInput);
  if (!parsedInput.success) throw new TaskInputError(def.name, parsedInput.error);
  const input = parsedInput.data;

  const { client, models } = getLlm();
  const model = models[def.tier];
  const { system, user } = def.prompt(input);

  // json_object mode requires the literal word "JSON" somewhere in the
  // messages (OpenAI hard rule) — appending here covers every prompt, so the
  // json_schema → json_object degradation can never 400 on that rule.
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `${system}\n\nRespond with ONLY a single JSON object matching the required schema.`,
    },
    { role: "user", content: user },
  ];

  // Strict schema where the endpoint supports it; the Zod parse below is
  // the actual guarantee — provider-side enforcement is never trusted.
  let responseFormat: OpenAI.ChatCompletionCreateParams["response_format"] =
    endpointCaps.jsonSchema
      ? {
          type: "json_schema",
          json_schema: {
            name: def.name.replace(/[^a-zA-Z0-9_-]/g, "_"),
            schema: z.toJSONSchema(def.output),
            strict: true,
          },
        }
      : { type: "json_object" };

  const startedAt = new Date();
  const usage = { inputTokens: 0, outputTokens: 0 };
  const maxAttempts = 1 + (def.maxRetries ?? 1);
  let issues: string[] = [];
  let apiCalls = 0;

  const finish = async (output: unknown, error?: string) => {
    const cost = costUsd(model, usage.inputTokens, usage.outputTokens);
    await recordTaskRun({
      taskName: def.name,
      tier: def.tier,
      model,
      ctx,
      input,
      output,
      error,
      usage,
      costUsd: cost.usd,
      priced: cost.priced,
      attempts: apiCalls,
      startedAt,
    });
  };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let completion: OpenAI.ChatCompletion;
    try {
      apiCalls++;
      completion = await client.chat.completions.create({
        model,
        messages,
        response_format: responseFormat,
        ...(def.maxOutputTokens
          ? { [endpointCaps.tokenParam]: def.maxOutputTokens + REASONING_ALLOWANCE }
          : {}),
      });
    } catch (err) {
      // Two known 400s degrade gracefully (and are remembered process-wide):
      // endpoints without json_schema support, and endpoints that only know
      // the legacy max_tokens param. Anything else (429, auth, network) must
      // surface as-is; swallowing it here would mask the real cause and
      // hammer a rate-limited endpoint with an immediate un-backed-off retry.
      const status = (err as { status?: number }).status;
      if (
        responseFormat?.type === "json_schema" &&
        status === 400 &&
        /json_schema|response_format/i.test(String(err))
      ) {
        endpointCaps.jsonSchema = false;
        responseFormat = { type: "json_object" };
        attempt--;
        continue;
      }
      if (
        endpointCaps.tokenParam === "max_completion_tokens" &&
        status === 400 &&
        /max_completion_tokens/i.test(String(err))
      ) {
        endpointCaps.tokenParam = "max_tokens";
        attempt--;
        continue;
      }
      await finish(undefined, String(err));
      throw err;
    }

    usage.inputTokens += completion.usage?.prompt_tokens ?? 0;
    usage.outputTokens += completion.usage?.completion_tokens ?? 0;
    const raw = completion.choices[0]?.message?.content ?? "";

    let candidate: unknown;
    try {
      candidate = JSON.parse(extractJson(raw));
    } catch {
      issues = ["response was not valid JSON"];
      messages.push(
        { role: "assistant", content: raw },
        { role: "user", content: repairPrompt(issues) },
      );
      continue;
    }

    const parsed = def.output.safeParse(candidate);
    issues = parsed.success
      ? (def.validate?.(parsed.data, input) ?? [])
      : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);

    if (issues.length === 0) {
      await finish(parsed.success ? parsed.data : candidate);
      return (parsed as z.ZodSafeParseSuccess<z.output<O>>).data;
    }

    messages.push(
      { role: "assistant", content: raw },
      { role: "user", content: repairPrompt(issues) },
    );
  }

  await finish(undefined, `validation failed: ${issues.join("; ")}`);
  throw new TaskOutputError(def.name, issues);
}

function repairPrompt(issues: string[]): string {
  return [
    "Your previous response failed validation:",
    ...issues.map((i) => `- ${i}`),
    "Respond again with ONLY corrected JSON matching the required schema.",
  ].join("\n");
}
