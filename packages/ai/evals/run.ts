import { readFileSync } from "node:fs";
import { join } from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: "../../apps/server/.env" });

import { classifyChange } from "../src/tasks/classify-change";
import { extractPricing } from "../src/tasks/extract-pricing";
import { parseAskQuery } from "../src/tasks/parse-ask-query";
import { flushTracing } from "../src/tracing";

/**
 * `bun eval` — CI quality gate (ai-platform doc). Each dataset is golden
 * JSONL; a task change that drops its score below threshold fails the run.
 * Datasets are seeds: grow them with hand-labeled REAL examples (real diffs,
 * real pricing pages) and production `wrong` verdicts.
 */

type Case = { input: unknown; expected: Record<string, unknown> };

function load(name: string): Case[] {
  return readFileSync(join(import.meta.dir, "datasets", name), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

/** classify-change: exact match, materiality worth more than category. */
function scoreClassify(expected: Record<string, unknown>, got: { materiality: string; category: string }): number {
  return (
    (expected.materiality === got.materiality ? 0.7 : 0) +
    (expected.category === got.category ? 0.3 : 0)
  );
}

/** extract-pricing: structural — plan names, then price/period per plan. */
function scorePricing(
  expected: Record<string, unknown>,
  got: { plans: { name: string; price: number | null; period: string }[] },
): number {
  const expPlans = expected.plans as { name: string; price: number | null; period: string }[];
  if (expPlans.length === 0) return got.plans.length === 0 ? 1 : 0;
  let total = 0;
  for (const exp of expPlans) {
    const match = got.plans.find(
      (p) => p.name.toLowerCase() === exp.name.toLowerCase(),
    );
    if (!match) continue;
    total += 0.4; // found the plan
    if (match.price === exp.price) total += 0.4;
    if (match.period === exp.period) total += 0.2;
  }
  // Penalize hallucinated extra plans.
  const extra = Math.max(0, got.plans.length - expPlans.length);
  return Math.max(0, total / expPlans.length - extra * 0.1);
}

/** parse-ask-query: expected keys only — scope gates everything else. */
function scoreParse(
  expected: Record<string, unknown>,
  got: Record<string, unknown>,
): number {
  if (expected.scope !== got.scope) return 0;
  const checks: number[] = [];
  for (const key of ["entityIds", "categories", "unmatchedMentions"]) {
    if (key in expected) {
      const exp = [...(expected[key] as string[])].sort();
      const g = [...((got[key] as string[]) ?? [])].sort();
      checks.push(JSON.stringify(exp) === JSON.stringify(g) ? 1 : 0);
    }
  }
  for (const key of ["from", "to", "intent"]) {
    if (key in expected) checks.push(expected[key] === got[key] ? 1 : 0);
  }
  if (checks.length === 0) return 1; // scope-only case
  return checks.reduce((a, b) => a + b, 0) / checks.length;
}

const SUITES = [
  {
    dataset: "classify-change.jsonl",
    threshold: 0.75,
    run: async (c: Case) => scoreClassify(c.expected, await classifyChange.run(c.input as never)),
  },
  {
    dataset: "extract-pricing.jsonl",
    threshold: 0.8,
    run: async (c: Case) => scorePricing(c.expected, await extractPricing.run(c.input as never)),
  },
  {
    dataset: "parse-ask-query.jsonl",
    threshold: 0.8,
    run: async (c: Case) =>
      scoreParse(
        c.expected,
        (await parseAskQuery.run(c.input as never)) as unknown as Record<string, unknown>,
      ),
  },
];

let failed = false;
for (const suite of SUITES) {
  const cases = load(suite.dataset);
  const scores: number[] = [];
  for (const [i, c] of cases.entries()) {
    try {
      const s = await suite.run(c);
      scores.push(s);
      if (s < 1) console.log(`  ${suite.dataset}#${i}: ${s.toFixed(2)}`);
    } catch (err) {
      scores.push(0);
      console.log(`  ${suite.dataset}#${i}: ERROR ${err}`);
    }
  }
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const ok = mean >= suite.threshold;
  failed ||= !ok;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${suite.dataset}: ${mean.toFixed(3)} (threshold ${suite.threshold}, n=${scores.length})`,
  );
}

await flushTracing();
process.exit(failed ? 1 : 0);
