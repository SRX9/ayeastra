import OpenAI from "openai";
import { z } from "zod";

/**
 * The ONLY place a model is named (ai-platform doc). One OpenAI-compatible
 * provider configured entirely from env — swapping models or providers is
 * an env change measured by evals, never a refactor.
 */

const EnvSchema = z.object({
  LLM_BASE_URL: z.url(),
  LLM_API_KEY: z.string().min(1),
  LLM_MODEL_SMALL: z.string().min(1),
  LLM_MODEL_MEDIUM: z.string().min(1),
  LLM_MODEL_HEAVY: z.string().min(1),
  LLM_EMBEDDING_MODEL: z.string().min(1),
});

export type Tier = "small" | "medium" | "heavy";

/**
 * Non-throwing env probe for surfaces that degrade instead of failing when
 * inference is unconfigured (e.g. onboarding prefill hides its AI affordance).
 */
export function isLlmConfigured(): boolean {
  return _cfg !== undefined || EnvSchema.safeParse(process.env).success;
}

let _cfg: { client: OpenAI; models: Record<Tier | "embedding", string> } | undefined;

// Lazy (repo convention, see db client): importing the package never crashes
// processes that don't run inference; first run validates all six vars.
export function getLlm() {
  if (!_cfg) {
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) {
      const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`packages/ai: invalid or missing env: ${missing}`);
    }
    const env = parsed.data;
    _cfg = {
      client: new OpenAI({ baseURL: env.LLM_BASE_URL, apiKey: env.LLM_API_KEY }),
      models: {
        small: env.LLM_MODEL_SMALL,
        medium: env.LLM_MODEL_MEDIUM,
        heavy: env.LLM_MODEL_HEAVY,
        embedding: env.LLM_EMBEDDING_MODEL,
      },
    };
  }
  return _cfg;
}

/**
 * USD per 1M tokens. Static and hand-maintained (observability doc: priced
 * from a static price table). Unknown models cost $0 and are flagged in
 * cost_events meta so the gap is visible, not silent.
 */
const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  "gpt-5": { input: 1.25, output: 10 },
  "gpt-5-mini": { input: 0.25, output: 2 },
  "gpt-5-nano": { input: 0.05, output: 0.4 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
  "text-embedding-3-large": { input: 0.13, output: 0 },
};

export function costUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): { usd: number; priced: boolean } {
  // Gateway model ids ("openai/gpt-5-mini") price by their base name.
  const price = PRICE_PER_MTOK[model] ?? PRICE_PER_MTOK[model.split("/").pop()!];
  if (!price) return { usd: 0, priced: false };
  return {
    usd: (inputTokens * price.input + outputTokens * price.output) / 1_000_000,
    priced: true,
  };
}
