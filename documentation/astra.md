# AskAstra — the in-app AI copilot

One assistant brain, two surfaces: the floating panel (bottom-right, every
authed screen) and the `/ask` page. Both stream through
`apps/web/src/app/api/astra/chat/route.ts` and share threads
(`ask_threads`/`ask_messages`, with `parts` holding AI SDK message parts).

## Architecture

- **`packages/astra`** — the brain. AI SDK (`streamText` + tools, medium
  tier via the same `LLM_*` env as `packages/ai`), system prompt, and the
  **source registry** (`src/registry.ts`).
- **Sources** (`src/sources/`) — each implements `AstraSource`: a set of AI
  SDK tools closing over an org-scoped `AstraContext`, plus an optional
  one-line ambient fact for the system prompt. Shipped: `platform-kb`,
  `business-context`, `intel-search` (wraps `packages/ask` retrieval with
  its deterministic evidence thresholds), `org-artifacts`.
- **Platform KB** (`packages/astra/kb/*.md`) — curated user-facing articles,
  embedded into the global `kb_articles`/`kb_chunks` tables by
  `bun kb:seed` (idempotent by content hash; run after deploys). Requires
  LLM credentials for embeddings.
- **Telemetry** — every chat turn writes one Langfuse generation + one
  `cost_events` row (`taskName: "astra.chat"`), same contract as tasks.

## Adding a knowledge source

1. Create `packages/astra/src/sources/<name>.ts` exporting an `AstraSource`:
   `key`, `title`, `description` (this line goes into the system prompt's
   source inventory — write it for the model), `tools(ctx)` returning AI SDK
   tools, optional `systemContext(ctx)`.
2. Every DB read inside a tool must go through `ctx.scoped` (or a join
   gated by `ctx.scoped.scope(...)`) — org isolation by construction.
   Tool outputs must be JSON-serializable and small (clip long fields).
3. Add it to `defaultSources` in `packages/astra/src/index.ts`.
   The route handler and UI pick it up automatically.
4. Cover it with a test in `packages/astra` (tool schema parses, org
   isolation if it reads per-org data).

## Ops notes

- Without `LLM_*` env vars the route streams an honest "not configured"
  notice and still persists the exchange; `kb:seed` refuses to run.
- `packages/astra/scripts/probe-gateway.ts` verifies the gateway supports
  streamed tool calls + usage reporting — run it once when credentials land.
- Rate limit: 30 user messages/hour/user (DB-backed, in the route).
