# 02 — AI Platform (`packages/ai`) (Phase 1)

The single package every LLM call in the product goes through. It enforces the three non-negotiables from [tech-stack.md](../../prd/tech-stack.md): per-task model routing, Zod-validated structured outputs only, and mechanical evidence discipline. No engine calls a model SDK directly — ever.

## The bar

Incumbent CI tools bolt an "AI summary" button onto stored items; assistants (ChatGPT Deep Research) produce fluent prose with unverifiable citations. The SOTA bar is **industrialized inference**: every AI task is a typed, versioned, traced, evaluated, cost-metered unit. One confident hallucinated claim in a pilot kills the deal (PRD risk #3) — so the platform makes unevidenced claims *structurally impossible to persist*, not just discouraged by prompts.

## Architecture

```
packages/ai/
├── client.ts        # OpenAI-compatible SDK client (base URL + key from env), tier → env model map
├── task.ts          # defineTask() — the only public API for running inference
├── tasks/           # one file per task (classify-change.ts, ground-signal.ts, ...)
├── evidence.ts      # FactSheet builder + citation validator
├── tracing.ts       # Langfuse wrapper + cost_events emission
└── evals/           # golden datasets + scorers, run in CI
```

### Model tiers (routing is a cost lever, not a religion)

One OpenAI-compatible provider, configured entirely from the environment — so any model on any OpenAI-API-compatible endpoint (OpenAI, a gateway/router like OpenRouter, or a self-hosted server) is a swap with no code change:

| Env var | Purpose |
|---|---|
| `LLM_BASE_URL` | OpenAI-compatible endpoint base URL |
| `LLM_API_KEY` | provider API key |
| `LLM_MODEL_SMALL` | model name for the `small` tier |
| `LLM_MODEL_MEDIUM` | model name for the `medium` tier |
| `LLM_MODEL_HEAVY` | model name for the `heavy` tier |
| `LLM_EMBEDDING_MODEL` | embedding model name (1536d) |

| Tier | Env model | Used for |
|---|---|---|
| `small` | `LLM_MODEL_SMALL` | classification, extraction, dedup checks, query parsing, page-kind detection |
| `medium` | `LLM_MODEL_MEDIUM` | signal grounding + assessment — the high-volume, per-signal synthesis |
| `heavy` | `LLM_MODEL_HEAVY` | briefing synthesis, Ask answers, battlecards, correlation/insight verification |
| `embedding` | `LLM_EMBEDDING_MODEL` | signal/change embeddings, Ask retrieval |

Tiers map to env model names **only** in `client.ts` — nothing else names a model. Swapping a model, or repointing the whole product at a different provider, is an env change measured by evals, not a refactor. All six vars are Zod-validated at boot (`packages/env`).

### `defineTask` — the universal contract

```ts
const classifyChange = defineTask({
  name: "classify-change",       // Langfuse + cost_events key
  tier: "small",
  input: ClassifyChangeInput,    // Zod
  output: ClassifyChangeOutput,  // Zod — response schema + post-parse validation
  prompt: (input) => ({ system, user }),
  maxRetries: 1,                 // one repair attempt (see below)
});
```

Execution pipeline inside `runTask()`:

1. Validate input (Zod). 2. Render prompt. 3. Call the provider (`client.chat.completions`) with the tier's model, requesting JSON — a strict JSON-schema `response_format` derived from the Zod output schema where the endpoint supports it, JSON-object mode otherwise. 4. **Parse the raw response through the Zod schema** — this is the guarantee; provider-side schema enforcement is treated as best-effort and never trusted (arbitrary OpenAI-compatible models may ignore it). On failure: **one repair attempt** — re-prompt with the validation errors appended. 5. Still failing → throw `TaskOutputError`; caller's job retries/dead-letters. **Partial or coerced output never escapes the package.** 6. Emit Langfuse trace span + `cost_events` row (tokens × price, tagged task/org/source/jobRun). 7. Return typed output.

## Evidence discipline (mechanical, not aspirational)

Synthesis tasks (assessment, briefings, Ask, battlecards) never receive raw prose. They receive a **FactSheet**:

```ts
type FactSheet = { facts: Array<{ ref: string;  // "F1", "F2" — stable per call
                                  text: string; evidenceId: string }> };
```

- Output schemas for synthesis tasks require `refs: string[]` on every claim-bearing block.
- `evidence.ts` validates post-generation: every `ref` exists in the input FactSheet; every material section cites ≥ 1 ref. Violations = schema failure → repair attempt → dead-letter.
- Persistence maps refs → `evidence_ids` on the signal/briefing row. The PRD's "100% evidence coverage" metric is enforced here, at the only gate everything passes through.
- System prompts state the contract too ("cite only F-refs; omit claims you cannot cite") — but the validator is the guarantee, the prompt is just guidance.

## Prompt conventions

- Prompts are TypeScript template functions living beside their task — versioned in git, reviewed in PRs. No prompt CMS at this scale.
- Every synthesis prompt receives: FactSheet + relevant `BusinessContext` slice + output constraints (length budgets, tone: analyst not marketer, hedge with confidence levels, "what would change this assessment" required on every assessment).
- Severity/confidence rubrics are shared constants (`rubrics.ts`) imported by every task that outputs them — one vocabulary, defined once (mirrors the pg enums).

## Evals (quality is CI-gated, not vibes)

- `evals/datasets/`: golden JSONL per task — e.g. 40 real diffs labeled cosmetic/content/material; 20 pricing pages with expected extracted plan matrices; 15 change+context pairs with expected severity.
- Scorers: exact-match for classifications, structural diff for extractions, LLM-judge (`heavy`, rubric-based) for synthesis quality.
- `bun eval` runs locally and in CI; a task PR that drops its score below threshold fails. Datasets are seeded by hand-labeling real examples (real diffs, real pricing pages, real briefing sections) before each task ships.
- Langfuse production traces feed new eval cases: every `wrong` feedback verdict creates a review-queue item; confirmed misses become dataset rows.

## Cost controls

- Per-call cost emitted to `cost_events` (see observability doc) — priced from a static price table in `client.ts`.
- Token budgets declared per task (`maxOutputTokens`); FactSheets truncated by ranked relevance, never by blind slicing.
- Prompt caching: system prompts + context blocks structured for provider prompt caching (stable prefix ordering, so any endpoint that caches on prefix benefits) — briefing generation reuses the org context block across sections.

## Build checklist

1. `client.ts` — env-configured OpenAI-compatible client, tier → model map, price table; `tracing.ts` (Langfuse + cost_events).
2. `defineTask` + repair loop + `TaskOutputError`.
3. `evidence.ts` FactSheet + citation validator.
4. `rubrics.ts` (severity, confidence, materiality — text mirrors schema enums).
5. First two real tasks with eval datasets: `classify-change`, `extract-pricing` (collection/diff engines consume them).
6. `bun eval` runner + CI wiring.

## Acceptance

- No model SDK (`openai`) import outside `packages/ai` (lint rule).
- A synthesis task cannot persist a claim with a fabricated ref — test proves the validator rejects it.
- Every task run appears in Langfuse with org/task tags and lands one `cost_events` row.
- Eval suite runs green in CI on the seeded datasets.
