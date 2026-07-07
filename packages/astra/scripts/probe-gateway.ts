/**
 * Throwaway probe: does the OpenAI-compatible gateway support AI SDK
 * streamText with tools (streamed tool calls) and report usage?
 * Run: bun probe-gateway.ts (from this directory)
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { stepCountIs, streamText, tool } from "ai";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: "d:/PROJECTS/AyeWatch B2B/apps/server/.env" });

const baseURL = process.env.LLM_BASE_URL;
const apiKey = process.env.LLM_API_KEY;
const modelId = process.env.LLM_MODEL_MEDIUM;
if (!baseURL || !apiKey || !modelId) {
  console.error("LLM env not configured", { baseURL: !!baseURL, apiKey: !!apiKey, modelId });
  process.exit(1);
}
console.log("probing", { baseURL, modelId });

const gateway = createOpenAICompatible({
  name: "gateway",
  baseURL,
  apiKey,
  includeUsage: true,
});

let toolCalled = false;
const result = streamText({
  model: gateway(modelId),
  system: "You are a test assistant. Use the lookup_number tool, then report the number.",
  messages: [{ role: "user", content: "What is the magic number for key 'alpha'? Use the tool." }],
  tools: {
    lookup_number: tool({
      description: "Look up the magic number for a key.",
      inputSchema: z.object({ key: z.string() }),
      execute: async ({ key }) => {
        toolCalled = true;
        console.log("TOOL EXECUTED with key:", key);
        return { number: 42137 };
      },
    }),
  },
  stopWhen: stepCountIs(3),
});

let chunks = 0;
let text = "";
for await (const part of result.textStream) {
  chunks++;
  text += part;
}
const usage = await result.totalUsage;
const steps = await result.steps;
console.log("---");
console.log("text:", JSON.stringify(text.slice(0, 300)));
console.log("streamed text chunks:", chunks);
console.log("tool executed:", toolCalled);
console.log("steps:", steps.length);
console.log("totalUsage:", usage);
console.log("finishReason:", await result.finishReason);
const ok = toolCalled && text.includes("42137") && (usage.inputTokens ?? 0) > 0 && chunks > 1;
console.log(ok ? "PROBE OK" : "PROBE FAILED CHECKS");
