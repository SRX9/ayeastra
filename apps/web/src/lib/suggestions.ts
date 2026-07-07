import { isLlmConfigured, suggestQuestions } from "@ayeastra/ai";

import { listSignals } from "@/lib/intel";

/** Empty-state suggested questions (ask doc): generated from the org's
 * recent signals so they only ask what the archive can answer. Degrades to
 * deterministic templates when the model is unconfigured or errors — the
 * empty state never breaks on an LLM problem. */

interface RecentSignal {
  entityName: string | null;
  finding: string;
}

/** Deterministic fallback (no model). */
function cannedSuggestions(entities: string[]): string[] {
  const unique = [...new Set(entities)].slice(0, 2);
  const out = unique.map((e) => `What has ${e} done in the last 30 days?`);
  if (unique.length === 2) {
    out.push(`Compare ${unique[0]} and ${unique[1]} pricing moves this quarter`);
  }
  out.push("How do signals and severity work?");
  return out;
}

export async function astraSuggestions(orgId: string): Promise<string[]> {
  const recent: RecentSignal[] = (await listSignals(orgId, {})).signals;
  const named = recent.filter(
    (r): r is RecentSignal & { entityName: string } => !!r.entityName,
  );
  const fallback = () => cannedSuggestions(named.map((r) => r.entityName));
  if (!isLlmConfigured() || named.length === 0) return fallback();
  try {
    const out = await suggestQuestions.run(
      {
        recentSignals: named
          .slice(0, 12)
          .map((r) => ({ entity: r.entityName, finding: r.finding })),
      },
      { orgId },
    );
    return out.questions;
  } catch (err) {
    console.error("suggest-questions degraded to canned suggestions", err);
    return fallback();
  }
}
