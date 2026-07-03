# 01 — Data Model & Schema (Phase 1)

The six primitives from [PRD Part 3](../../prd/03-product.md) as Drizzle schema in `packages/db`, plus the operational tables the engines need. One shared data model, never per-feature models. Everything downstream (collection, signals, briefings, Ask) reads and writes these tables — get this right first.

## The bar

Klue/Crayon model "intel items" per customer with weak cross-customer reuse, so every customer pays full collection cost and no shared history accrues. The SOTA move is a **two-layer model**: a shared, org-agnostic observation layer (sources, snapshots, changes) and a per-org intelligence layer (signals, insights, briefings) grounded in that org's context. One fetch serves every customer watching the same source; each customer gets their own assessment. This is simultaneously the cost discipline (shared caching) and the moat (one global evidence archive that compounds).

## Layering rule

| Layer | Tables | Tenancy |
|---|---|---|
| **Global observation** (facts about the world) | `entities`, `entity_aliases`, `sources`, `snapshots`, `changes`, `evidence` | No org ID. Shared across all orgs. |
| **Per-org intelligence** (what it means for *this* business) | `org_entities`, `business_context`, `signals`, `insights`, `actions`, `briefings`, `battlecards`, `feedback`, `ask_threads`, `deliveries` | `workos_org_id text NOT NULL`, leading column of every index. |
| **Ops** | `monitor_state`, `cost_events`, `job_dead_letters` | Mixed (documented per table). |

Rules:
- **IDs:** UUIDv7 generated in app code (time-ordered, index-friendly). One helper in `packages/db`.
- **Org scoping:** a `scopedDb(orgId)` query helper in `packages/db` is the only way app code touches per-org tables; it injects the `workos_org_id` predicate. Raw `db` access to per-org tables is a code-review reject.
- **Enums as pg enums:** `severity`, `confidence`, `entity_type`, `source_kind`, `signal_category`, `feedback_verdict` — shared vocabulary, defined once.
- **Immutability:** `snapshots`, `changes`, `evidence`, delivered `briefings` are append-only. No updates, no deletes (soft-archive flags only). The evidence archive is the moat; treat it like a ledger.
- **pgvector** from day 1: `embedding vector(1536)` on `signals` and `changes` (dedup + Ask retrieval). PlanetScale Postgres supports pgvector; no separate vector DB.

## Tables

### Global observation layer

```
entities            id, type (company|product|market|person|vendor), canonical_name,
                    domain, description, profile jsonb, created_at
entity_aliases      entity_id, alias, source (user|discovery|resolution)   -- unique(alias, entity_id)
entity_relations    parent_id, child_id, relation (product_of|subsidiary_of|competes_in)

sources             id, entity_id, url (unique), kind (pricing|changelog|blog|docs|careers|
                    news|filings|app_store|homepage), discovery (auto|user),
                    status (ok|degraded|broken|retired), created_at
snapshots           id, source_id, fetched_at, content_hash, r2_html_key, r2_md_key,
                    r2_screenshot_key nullable, http_status, fetch_meta jsonb
changes             id, source_id, before_snapshot_id, after_snapshot_id, detected_at,
                    materiality (cosmetic|content|material), category (signal_category enum),
                    extracted_facts jsonb, diff_r2_key, embedding vector,
                    summary text            -- org-agnostic one-liner, small-model generated
evidence            id, change_id nullable, source_url, fetched_at, content_hash,
                    r2_keys jsonb, extracted jsonb, share_token nullable, created_at
```

### Per-org intelligence layer

```
org_entities        workos_org_id, entity_id, role (competitor|self|market|vendor),
                    tier (primary|secondary|watch), importance smallint, notes,
                    added_at, archived_at nullable       -- pk(org_id, entity_id)
business_context    workos_org_id, version int, payload jsonb (BusinessContext — see
                    context-engine doc), created_by, created_at
                    -- append-only; current = max(version)
signals             id, workos_org_id, change_id -> changes, entity_id,
                    category, severity (critical|high|notable|info),
                    confidence (high|moderate|low), finding text, why_it_matters text,
                    recommended_action text, confidence_notes text ("what would change this"),
                    priority_attachments jsonb ([{priorityId, segment, positioningRisk}]),
                    context_version int, scores jsonb (sub-scores from scoring engine),
                    evidence_ids uuid[], embedding vector, dedup_key text, created_at,
                    status (new|acknowledged|dismissed|snoozed), snoozed_until nullable
insights            id, workos_org_id, signal_ids uuid[], pattern text, analysis text,
                    forward_look text, recommended_actions jsonb, confidence, created_at
actions             id, workos_org_id, source_type (signal|insight|briefing), source_id,
                    description, owner_user_id nullable, status (open|done|dropped),
                    due_date nullable, created_at, completed_at
briefings           id, workos_org_id, kind (weekly|baseline|dossier), period_start, period_end,
                    status (generating|qa_failed|ready|delivered), sections jsonb,
                    context_version int, rendered_r2_keys jsonb, delivered_at, created_at
battlecards         id, workos_org_id, entity_id, sections jsonb (per-section: content,
                    provenance auto|edited, updated_at), changelog jsonb, updated_at
feedback            id, workos_org_id, user_id, target_type (signal|briefing_section|
                    battlecard_section|ask_answer), target_id, verdict (useful|not_useful|
                    wrong|already_knew), note nullable, created_at
ask_threads         id, workos_org_id, user_id, title, created_at
ask_messages        id, thread_id, role, content, citations jsonb, created_at
deliveries          id, workos_org_id, channel (email|slack), target_type (alert|digest|
                    briefing), target_id, status (queued|sent|failed), attempts, sent_at
```

### Dormant primitives (modeled now, activated later — PRD requires day-1 schema)

```
missions            id, workos_org_id, goal, entity_ids uuid[], owner_user_id,
                    status (draft|active|closed), kpis jsonb, created_at     -- Phase 3
outcomes            id, workos_org_id, action_id, kpi, result text, evidence_ids uuid[],
                    created_at                                               -- Phase 2
```

### Ops layer

```
monitor_state       source_id pk, check_interval_minutes, next_check_at, last_change_at,
                    change_rate_ewma real, consecutive_failures int, pinned_interval nullable
cost_events         id, at, vendor (firecrawl|anthropic|openai|cloudflare_email|r2|other),
                    task_name, units real, cost_usd numeric(10,6),
                    workos_org_id nullable, source_id nullable, job_run_id nullable, meta jsonb
job_dead_letters    id, job_name, payload jsonb, error text, created_at, resolved_at nullable
```

## Key decisions

1. **`changes` is org-agnostic; `signals` is org-specific.** A pricing-page diff is a fact; "this pressures your premium positioning" is an assessment. The split makes shared caching structural, not an optimization, and means N customers watching Stripe cost one crawl + N cheap grounding calls, not N full pipelines.
2. **Entities are global, `org_entities` is the org's lens.** Entity resolution ("Stripe" = one object) is trivially satisfied later because there was never a per-org copy to merge. Alias table feeds the resolver.
3. **`business_context` is append-only versioned JSON.** Signals and briefings record `context_version`, so "why did we score this HIGH?" is always answerable — audit trail for trust, input for the Phase-2 outcome loop.
4. **`sections jsonb` on briefings/battlecards, not normalized section tables.** Sections are read-as-a-whole artifacts; per-section feedback references them by stable section key inside the JSON. Normalize only if querying inside sections becomes real.
5. **`evidence_ids` is a first-class column on signals**, not buried in JSON — the evidence-coverage metric (`100% of material claims`) is a SQL query, not a parsing job.

## Build checklist

1. Enums + UUIDv7 helper + `scopedDb` helper.
2. Global layer tables + indexes (`sources.url` unique; `snapshots(source_id, fetched_at)`; `changes(source_id, detected_at)`).
3. Per-org layer tables + composite indexes (`signals(workos_org_id, created_at desc)`, `signals(workos_org_id, entity_id, created_at desc)`, `feedback(workos_org_id, target_type, target_id)`).
4. pgvector extension + HNSW indexes on `signals.embedding`, `changes.embedding`.
5. Dormant + ops tables.
6. Seed script: demo org, 3 competitor entities with sources — every engine doc's tests build on this seed.

## Acceptance

- `bun db:push` clean; seed script produces a queryable demo world.
- `scopedDb` proves isolation: a cross-org read test fails without the helper, passes with it.
- Every enum value used in the PRD (severities, confidences, source tiers/kinds) exists in the schema — no magic strings anywhere downstream.
