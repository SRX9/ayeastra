# 03 — Jobs Platform (Phase 1)

Background execution for everything that isn't a page load: monitor scheduling, fetch fan-out, analysis pipelines, briefing generation, deliveries. Resolves the PRD open decision and fixes the conventions every engine's jobs follow regardless of vendor.

**Decision record (2026-07-02): hybrid.** The **global observation layer runs on Cloudflare** (Workers + Queues + Workflows); the **per-org intelligence layer runs on Trigger.dev Cloud**. The platform seam is the same seam as the two-layer data model — one boundary, not two.

- **Why CF for the firehose:** ~90% of run volume is fetch → hash → store → enqueue. Cloudflare bills CPU-only — waiting on Firecrawl/LLM responses is free — making it 10–40× cheaper per run than wall-clock-billed platforms. Queues have native dead-letter queues; snapshots write to R2 via binding (no egress, no S3 keys); Postgres via Hyperdrive.
- **Why Trigger.dev for the intelligence layer:** dynamic per-tenant schedules with timezones (digest 8:00 org-TZ, briefing Monday org-TZ — no hand-rolled scheduler), tag-searchable runs (`org:`, `source:`), per-step retry via child tasks, native idempotency keys, replay, no step timeouts. This 10% of volume is the product; its debuggability is product debuggability.
- **Rejected:** Inngest (steps would execute in our web functions — background compute never runs on Vercel, cost constraint); all-Cloudflare (would hand-roll per-org TZ scheduling, run search/replay, and failure-triage UX — buy-don't-build); all-Trigger.dev (~$500+/mo at 1k orgs vs ~$215 hybrid, wall-clock billing punishes the fetch firehose).
- **Managed, not self-hosted:** Trigger.dev Cloud free/Hobby covers launch scale ($0–10/mo). Tripwire: bill sustains > ~$400/mo → revisit self-hosting (Apache 2.0; skip the Railway template — its workers need a separate droplet anyway; a single Hetzner box wins).
- **Modeled at 1,000 active orgs** (~20k sources, ~1.5M fetches/mo, ~3.3M total runs/mo): CF ≈ $10–15/mo · Trigger.dev ≈ $200/mo. Jobs platform stays the smallest COGS line (Firecrawl and tokens are each 10–50× larger).

## The split

| Layer | Platform | Jobs | Mechanics |
|---|---|---|---|
| Global observation (org-agnostic) | **Cloudflare** | `scheduler.tick`, `source.fetch`, `source.discover`, `change.detect`, `embed.upsert` | Worker cron (\*/15) → Queues fan-out → consumer Workers; `source.discover` is a Workflow (multi-step); R2 via binding; Postgres via Hyperdrive; DLQ per queue |
| Per-org intelligence | **Trigger.dev Cloud** | `change.analyze`, `signal.ground`, `signal.route`, `digest.daily`, `briefing.weekly`, `briefing.baseline`, `battlecard.refresh`, `delivery.send`, `context.enrich` | Tasks + child tasks; per-org schedules via `schedules.create` (timezone-aware); queues with `concurrencyKey` per org |

**The seam (one direction):** CF `change.detect` persists a material change → `POST` Trigger.dev REST API to trigger `change.analyze` with idempotency key `analyze:{changeId}`. Reverse traffic uses plain HTTP APIs only: Trigger tasks publish signal embeddings to the `embed` queue via the Queues HTTP API, and send email via the Cloudflare Email REST API. Neither side imports the other's SDK.

**Isolation stands:** no vendor SDK outside `packages/jobs`. `defineJob` ships two adapters — `cf` (queue-consumer/Workflow-step wrapper) and `trigger` (task wrapper) — sharing one contract: idempotency key, retries, timeout, tracing hooks, dead-letter writer. Swapping either vendor stays a contained change.

**Runtime portability (new constraint):** `packages/ai`, `packages/db`, and anything a CF-side job imports must run on both Node and workerd (`classify-page-kind` and extraction tasks execute on Workers; Drizzle + `pg` works there via Hyperdrive). CI runs a workerd smoke test on these packages.

## Conventions (vendor-independent, enforced in review)

1. **Payloads are IDs, never blobs.** A job receives `{ sourceId }` / `{ orgId, briefingId }` and reads state from Postgres. Replays are then always safe and cheap.
2. **Every job is idempotent** with an explicit idempotency key derived from its natural work unit: `fetch:{sourceId}:{scheduledHourBucket}`, `briefing:{orgId}:{periodStart}`, `deliver:{deliveryId}`. Duplicate triggers are no-ops.
3. **Retries:** default 3 attempts, exponential backoff + jitter. Exhausted → row in `job_dead_letters` + internal ops alert (CF: DLQ consumer writes the row and alerts; Trigger: failure webhook does the same). Dead letters are reviewed, not ignored — an internal page lists unresolved ones.
4. **Concurrency keys:** Trigger-side pipelines keyed by org via queue `concurrencyKey` (a briefing run never races itself). CF-side per-domain politeness (max 2 concurrent per domain) is a small Durable Object semaphore — the one hand-rolled piece, accepted for the cost win; it lives in `packages/jobs/cf` and nowhere else.
5. **Time-boxing:** every job declares a timeout; anything over 10 min must be decomposed into steps (Trigger child tasks / Workflow steps).
6. **Tracing:** jobRunId (Trigger run ID / Queues message ID / Workflow instance ID) propagates into Langfuse traces and `cost_events.job_run_id` — one ID connects a briefing to every model call and cent it cost.

## Job inventory (Phase 1 — defined here, implemented in their engine docs)

| Job | Trigger | Platform | Doc |
|---|---|---|---|
| `scheduler.tick` | cron \*/15 min (Worker cron trigger) | CF | collection |
| `source.fetch` | fan-out from tick via `fetch` queue | CF | collection |
| `source.discover` | entity created / manual | CF Workflow | collection |
| `change.detect` | after fetch via `detect` queue | CF | diff-evidence |
| `embed.upsert` | change/signal created via `embed` queue (Trigger publishes over HTTP) | CF | ask-engine |
| `change.analyze` | material change (REST seam from `change.detect`) | Trigger.dev | scoring |
| `signal.ground` | per watching org | Trigger.dev | scoring |
| `signal.route` | after grounding | Trigger.dev | alerts-delivery |
| `digest.daily` | per-org schedule, 8:00 org-TZ | Trigger.dev | alerts-delivery |
| `briefing.weekly` | per-org schedule, Monday org-TZ | Trigger.dev | briefing |
| `briefing.baseline` | plan activated | Trigger.dev | briefing |
| `battlecard.refresh` | battlecard-relevant signal | Trigger.dev | battlecards |
| `delivery.send` | artifact ready | Trigger.dev | alerts-delivery |
| `context.enrich` | onboarding stage events | Trigger.dev | context-engine |

## Validation slice (M0, ~2 days — replaces the vendor spike)

One thin path across the whole seam before mass building: CF cron tick → 50 fetches through the `fetch` queue (politeness DO + DLQ configured) → `change.detect` → REST-trigger one Trigger.dev LLM task → results written. Proves: Queues retries/DLQ, the DO semaphore, Hyperdrive from Workers, seam idempotency (double-trigger is a no-op), two org-TZ schedules firing correctly, tag search on runs. Record surprises in this doc.

## Build checklist

1. Validation slice above; record results here.
2. `packages/jobs`: shared `defineJob` contract + `cf` and `trigger` adapters (idempotency, retries, timeout, tracing hooks, dead-letter writer).
3. Deploys in CI: `wrangler deploy` for the CF worker(s) and `trigger deploy` for tasks — both separate from the Vercel web deploy.
4. Internal dead-letter page (CF DLQ consumer + Trigger failure webhook both write `job_dead_letters`).

## Acceptance

- Kill a briefing run mid-flight → rerun resumes/retries without duplicate sections or duplicate deliveries.
- Trigger the same `source.fetch` twice in one bucket → second is a no-op.
- A failing job appears in dead letters with payload + error, and fires an internal ops alert.
- Two orgs in different timezones each receive their digest at their local 8:00.
- A seeded week of firehose runs costs ≈ $0 beyond the $5 Workers plan (assert via cost dashboard).
