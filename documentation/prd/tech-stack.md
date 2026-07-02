# AyeAstra Tech Stack

Technology choices for AyeAstra, aligned with the launch product: Competitive Watch — evidence-backed briefings, diff archive, and context-grounded alerts. See the [PRD](README.md) for product scope.

## Core stack

| Area | Choice | Why |
|---|---|---|
| Web app | Next.js | Full-stack React for dashboard, onboarding, settings, API routes |
| Language | TypeScript | Shared types across web, server, DB, and packages |
| Monorepo | Turborepo + Bun workspaces | Apps + shared packages, fast local dev |
| Auth | WorkOS AuthKit | Sign-up, orgs, enterprise SSO/SAML/SCIM later without re-platforming |
| Database | PlanetScale Postgres (+ pgvector when needed) | Source of truth for orgs, entities, signals, insights, actions, evidence index |
| ORM | Drizzle | Type-safe schema + migrations |
| UI | React + Tailwind + shared UI package | Consistent dashboard, reusable components |
| Validation | Zod | Env vars, API payloads, and **every structured AI output before it touches the DB** |

## Supporting services (decided)

Buy, don't build — anything sold for ~$100/month is not our product.

| Need | Choice | Notes |
|---|---|---|
| Hosting | Vercel | Native Next.js fit; revisit only on cost signal |
| Jobs / queues | Trigger.dev **or** Inngest (1-week spike to pick) | Scheduled fan-out for monitors, retries, long-running LLM steps, observability per run |
| Crawling | Firecrawl (managed) | Don't build a crawler. Zyte/Browserless as fallback for hard targets |
| Object storage | Cloudflare R2 | Page snapshots, diffs, exports; cheap egress |
| Cache / rate limits | Upstash Redis | Serverless-friendly; also coordinates expensive source fetches |
| Observability | Sentry (errors) + Axiom (logs) + Langfuse (LLM traces) | LLM tracing is non-optional — briefing quality debugging depends on it |
| Delivery | Email first; Slack optional | Delivery channels for alerts and briefings, not sources of customer truth |

## LLM strategy

- **Per-task routing:** small/cheap models for classification, extraction, dedup; frontier model (Claude) for assessment, correlation, and briefing synthesis. Model choice per task is a cost lever, not a religion.
- **Structured outputs only:** every AI output is schema-validated (Zod) before entering the database. Unvalidated prose never becomes a Signal.
- **Evidence discipline in the pipeline:** every generated claim must carry source URL + timestamp + content hash from the collection layer; synthesis steps may not invent claims without attached evidence.

## Cost disciplines (gross margin depends on these)

1. **Adaptive scheduling** — crawl frequency follows observed change rates per source, not a fixed interval.
2. **Shared caching** — public sources fetched once across all customers watching the same entity.
3. **Per-monitor cost telemetry from day 1** — crawl + inference cost per monitor per customer, visible in an internal dashboard. We cannot price or scale what we don't measure.

## Architecture principles

- The six primitives (Entity, Signal, Insight, Action, Mission, Outcome) are the schema backbone; one shared data model, never per-feature models.
- WorkOS organization IDs anchor multi-tenant ownership.
- Postgres is the source of truth; add pgvector before any separate vector DB.
- The diff/evidence archive is first-class infrastructure (R2 snapshots + DB index), not an afterthought — it is the product's signature surface and earliest moat.
- Business context is captured through onboarding, reviewable setup artifacts, priority edits, and feedback. The first product does not require access to customer systems.
- Agents (collection/analysis workers) follow the universal contract from PRD Part 3; adding a capability = adding an agent, with no UI implications in Phase 1.
- Build infrastructure only when it improves briefing quality, alert reliability, or workflow adoption.
