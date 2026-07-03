# 13 — Observability & Cost Telemetry (Phase 1)

Per-monitor cost telemetry from day 1 is a PRD hard requirement ("we cannot price or scale what we don't measure") — gross margin (65–75%) depends on it. Plus the tracing that makes briefing-quality debugging possible: Langfuse (LLM) + Axiom (logs). A dedicated error tracker (Sentry) is deliberately deferred — job errors surface through platform failure alerts + dead letters (below).

## The bar

Most AI startups discover their unit economics in the model-provider invoice. The bar here: **COGS per customer is a dashboard, not a surprise** — every fetch, token, and email attributes to a vendor, task, source, and (where applicable) org, rolled up daily, with anomaly alerts before money burns. And when a briefing section is weak, the full trace (inputs, FactSheet, prompt, output, cost) is one click away.

## Cost telemetry

`cost_events` (data-model doc) is written at the three spend gates — nowhere else, nothing missed:

| Gate | Emits |
|---|---|
| `packages/ai` `runTask` | tokens × price-table, tagged task/tier/org/jobRun |
| Collection `FetchProvider` | Firecrawl credits, tagged sourceId |
| Delivery send | Email sends (Cloudflare Email); R2 ops estimated monthly (flat, negligible) |

**Attribution rule for shared costs:** global-layer spend (fetches, change detection) attributes to `source_id` with `org_id null`; org-layer views apportion a source's cost across orgs watching it. Per-org COGS = own inference/delivery + share of watched sources.

**Rollups** (nightly job → summary tables): cost per org/day, per source/day, per task/day. Internal admin dashboard (`/admin`, env-gated allowlist):
- Margin per customer: plan revenue (from `org_billing`) vs. COGS trend.
- Top-N expensive sources/tasks; briefing cost per org per week (target < $1.50, briefing doc).
- Anomaly alerts (internal email/Slack): org/day > 3× its 14-day mean; global day > budget cap; single job run > $5.

## Tracing & logs

- **Langfuse:** trace per job run (`traceId = jobRunId`), span per `runTask`, tags `{org, entity, source, task}` — a briefing links to every model call that built it. `wrong` feedback verdicts link the trace into the eval review queue (scoring doc).
- **Errors (no Sentry for now):** Trigger.dev failure alerts (Slack/webhook) + Cloudflare Workers Logs cover job errors; every dead-lettered job fires an internal ops alert and lands on the dead-letter page. Revisit a dedicated tracker when web-app client errors start mattering.
- **Axiom:** structured logs (pino) with `jobRunId`/`deliveryId`/`orgId` correlation fields; retention ≥ 90d.
- **Pipeline health internal alerts:** broken primary-competitor source (collection), repeated QA-gate section drops (briefing), delivery failure rate — routed to an internal ops channel.

## Build checklist

1. Price table + emission at the three gates (built alongside each engine — this doc defines the contract).
2. Nightly rollup job + summary tables.
3. `/admin` dashboard (tables + recharts; plain and internal — no design budget).
4. Anomaly alert job. 5. Langfuse/Axiom wiring + failure-alert channels + correlation-ID conventions.

## Acceptance

- One seeded week: sum of `cost_events` reconciles with vendor dashboards within 10%.
- "What does org X cost us per month?" and "most expensive source?" are dashboard reads.
- A briefing section navigates to its full Langfuse trace in one click.
- Simulated runaway (tight-loop task) trips the anomaly alert same-day.
