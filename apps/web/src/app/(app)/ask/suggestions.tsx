import { isLlmConfigured, suggestQuestions } from "@ayeastra/ai";

import { askQuestion } from "./actions";

/** Empty-state suggested questions (ask doc): generated from the org's
 * recent signals so they only ask what the archive can answer. Degrades to
 * deterministic templates when the model is unconfigured or errors — the
 * empty state never breaks on an LLM problem. */

export interface RecentSignal {
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
  return out;
}

async function generate(orgId: string, recent: RecentSignal[]): Promise<string[]> {
  const named = recent.filter((r): r is RecentSignal & { entityName: string } => !!r.entityName);
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

export async function SuggestedQuestions({
  orgId,
  recent,
}: {
  orgId: string;
  recent: RecentSignal[];
}) {
  const questions = await generate(orgId, recent);
  if (questions.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {questions.map((q) => (
        <form key={q} action={askQuestion}>
          <input type="hidden" name="question" value={q} />
          <button
            type="submit"
            className="w-full cursor-pointer rounded-md border border-border px-3 py-1.5 text-left text-sm text-muted transition-colors hover:border-border-secondary hover:text-foreground"
          >
            {q}
          </button>
        </form>
      ))}
    </div>
  );
}
