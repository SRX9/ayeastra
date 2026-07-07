import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { getLlm } from "@ayeastra/ai";

/**
 * AI SDK provider over the same gateway as packages/ai — getLlm() stays the
 * single env seam (validates all six LLM_* vars); this only adapts it for
 * streamText. Chat runs on the medium tier: the multi-step tool loop
 * multiplies latency, and time-to-first-token matters more than the heavy
 * tier's marginal quality. One constant to bump if evals disagree.
 */

export const CHAT_TIER = "medium" as const;

let _provider: ReturnType<typeof createOpenAICompatible> | undefined;

export function chatModel() {
  getLlm(); // validate env exactly like every other inference path
  _provider ??= createOpenAICompatible({
    name: "gateway",
    baseURL: process.env.LLM_BASE_URL!,
    apiKey: process.env.LLM_API_KEY!,
    // Some gateways omit streamed usage unless stream_options.include_usage
    // is sent — telemetry (cost_events) depends on it.
    includeUsage: true,
  });
  const modelId = getLlm().models[CHAT_TIER];
  return { model: _provider(modelId), modelId };
}
