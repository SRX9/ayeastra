# 10 — Ask Engine (Phase 1)

Natural-language queries over everything AyeAstra has collected for the org — "What has PayBridge done in the last 30 days?" — with every answer evidence-backed. Not a general chatbot: it answers **only from the org's collected intelligence**, and says so when it can't.

## The bar

Perplexity/ChatGPT answer from the live web with no memory and shaky citations. Incumbent "ask" features are keyword search with a summary on top. SOTA here is **retrieval over a private, timestamped intelligence archive**: hybrid retrieval with metadata precision, citations that resolve to hash-verified evidence, and calibrated refusal — "we haven't collected evidence on that" beats a confabulated answer every time. The archive is the differentiation; Ask is how users feel it.

## Index

Embedded (via `embed.upsert`, at creation time) into pgvector with metadata `{orgId, entityIds, date, severity, kind}`:

| Object | Embedded text |
|---|---|
| signals | finding + why-it-matters |
| changes (org-agnostic; joined through org's entities) | summary + key facts |
| briefing sections | section text |
| entity profiles | profile summary |
| battlecard sections | section content |

One index, filtered by org at query time (global `changes` reachable only through the org's `org_entities` join — enforced in the retrieval helper, same isolation discipline as `scopedDb`).

## Query pipeline

1. **Parse** (`small` task): query + org entity list → `{entities[], timeRange, categories[], intent: lookup|summary|comparison|timeline}`. Resolves "PayBridge" via alias table; "last quarter" → dates.
2. **Retrieve** (hybrid): vector top-k + Postgres full-text keyword match, both metadata-filtered (org, entities, time range) → merged.
3. **Rerank** (`small` listwise task) → top 10–15 → FactSheet.
4. **Synthesize** (`heavy`): answer blocks, each with mandatory `refs`; timeline intent → chronological structure; comparison intent → per-entity structure. Same citation validator as everything else — an uncited claim cannot render.
5. **Refusal path:** retrieval score below threshold → honest response: what we *do* watch for those entities + offer to add coverage. Also handles out-of-scope ("what's our churn?" → "AyeAstra watches external intelligence — I don't have your internal data").
6. **Render:** streamed (`streamdown` is already a dependency); inline citation chips → evidence/signal deep links.

Conversation: thread persistence (`ask_threads`/`ask_messages`), prior turns in context for follow-ups ("what about their hiring?"). Suggested questions on empty state, generated from the org's recent signals — teaches the habit (Ask weekly repeat usage > 40% is a PRD metric).

## Build checklist

1. `embed.upsert` job + backfill command; retrieval helper with org isolation.
2. Parse task (+ eval: 20 real queries → expected filters).
3. Hybrid retrieval + rerank.
4. Synthesis task with citation enforcement + refusal thresholds.
5. Thread persistence + streaming route + Ask surface wiring (web-app doc).
6. Suggested-questions generator.

## Acceptance

- "What has [seeded competitor] done in the last 30 days?" returns only that entity's items in range, every claim citing resolvable evidence.
- A question about an unwatched company or internal data triggers the honest refusal path, never a guess.
- Org isolation test: identical question from a second org returns only its own intelligence.
- Follow-up questions resolve pronouns/context from the thread.
