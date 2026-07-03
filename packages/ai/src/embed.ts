import { costUsd, getLlm } from "./client";
import { recordTaskRun, type RunContext } from "./tracing";

/**
 * Embeddings (1536d — matches vector(1536) columns on signals/changes).
 * Same telemetry contract as tasks: one cost_events row per call.
 */
export async function embed(
  texts: string[],
  ctx: RunContext = {},
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { client, models } = getLlm();
  const model = models.embedding;
  const startedAt = new Date();

  const res = await client.embeddings.create({ model, input: texts });

  const inputTokens = res.usage?.prompt_tokens ?? 0;
  const cost = costUsd(model, inputTokens, 0);
  await recordTaskRun({
    taskName: "embed",
    tier: "embedding",
    model,
    ctx,
    input: { count: texts.length },
    output: { dimensions: res.data[0]?.embedding.length },
    usage: { inputTokens, outputTokens: 0 },
    costUsd: cost.usd,
    priced: cost.priced,
    attempts: 1,
    startedAt,
  });

  return res.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}
