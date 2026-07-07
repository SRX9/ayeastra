import type { Tool } from "ai";

import type { RunContext } from "@ayeastra/ai";
import type { ScopedDb } from "@ayeastra/db";

/**
 * AskAstra source registry — the plug-and-play seam. A source bundles the
 * tools it exposes to the agent loop plus an optional ambient fact for the
 * system prompt. Adding a source = one file + one entry in defaultSources;
 * the route handler and UI never change.
 */

export interface AstraContext {
  /** The ONLY db handle a source gets — org isolation by construction
   * (data-model law #3). */
  scoped: ScopedDb;
  userId: string;
  orgName: string;
  /** Current app pathname ("/missions/abc") — page awareness. */
  pathname?: string;
  /** Telemetry context forwarded to embed()/task runs. */
  runCtx: RunContext;
}

export interface AstraSource {
  /** Stable kebab-case key: "platform-kb", "intel-search", … */
  key: string;
  title: string;
  /** One-liner rendered into the system prompt's source inventory. */
  description: string;
  /** AI SDK tools, closures over ctx. */
  tools(ctx: AstraContext): Record<string, Tool>;
  /** Optional ambient fact injected into the system prompt every turn —
   * keep it tiny (one line), it costs tokens on every message. */
  systemContext?(ctx: AstraContext): Promise<string | null>;
}

/** Merges all sources into one toolset + a prompt fragment listing them. */
export function buildToolset(
  sources: AstraSource[],
  ctx: AstraContext,
): { tools: Record<string, Tool>; sourceInventory: string } {
  const tools: Record<string, Tool> = {};
  const inventory: string[] = [];
  for (const source of sources) {
    inventory.push(`- ${source.title}: ${source.description}`);
    for (const [name, tool] of Object.entries(source.tools(ctx))) {
      if (tools[name]) {
        throw new Error(
          `astra: duplicate tool name "${name}" (source "${source.key}")`,
        );
      }
      tools[name] = tool;
    }
  }
  return { tools, sourceInventory: inventory.join("\n") };
}

/** Ambient one-liners from every source that offers one. Failures are
 * skipped, not fatal — ambient context is nice-to-have. */
export async function buildAmbient(
  sources: AstraSource[],
  ctx: AstraContext,
): Promise<string[]> {
  const lines = await Promise.all(
    sources.map(async (s) => {
      if (!s.systemContext) return null;
      try {
        return await s.systemContext(ctx);
      } catch (err) {
        console.error(`astra: systemContext failed for "${s.key}"`, err);
        return null;
      }
    }),
  );
  return lines.filter((l): l is string => !!l);
}
