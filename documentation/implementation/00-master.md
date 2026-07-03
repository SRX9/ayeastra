# AyeAstra — Implementation Master Plan

The engineering companion to the [PRD](../prd/README.md). Each linked doc is a self-contained implementation plan for one engine: its SOTA bar, architecture, data, pipelines, build checklist, and acceptance criteria — written to be fed to implementation one at a time. This doc holds what's shared: the system shape, the build order, and the rules every engine obeys.

**How to use:** implement docs in milestone order below. Read this doc + [phase-1/01-data-model.md](phase-1/01-data-model.md) before any engine doc — the two-layer data model is the load-bearing decision everything else assumes.

---

## Already built (don't re-plan)

Turborepo + Bun monorepo · Next.js `apps/web` + Express `apps/server` · WorkOS auth, orgs, roles, seats ([auth.md](../auth.md)) · Stripe billing code ([billing.md](../billing.md), dashboard setup pending) · packages: `auth`, `config`, `db` (org_billing only), `env` · HeroUI/Tailwind v4 UI base.

## System shape

```
                    ┌─ GLOBAL OBSERVATION LAYER (org-agnostic, shared, immutable) ─┐
 entities/sources ─►│ collection ──► snapshots (R2+DB) ──► diff/evidence ──► changes │
                    └──────────────────────────────┬───────────────────────────────┘
                                                   │ per watching org
                    ┌─ PER-ORG INTELLIGENCE LAYER ─▼───────────────────────────────┐
 business context ─►│ scoring/grounding ──► signals ──► insights                    │
 (onboarding AI)    │      │                   │                                    │
                    │      ▼                   ▼                                    │
                    │  alerts/digests    weekly briefing · battlecards · Ask        │
                    └──────────────────────────┬────────────────────────────────────┘
                                               ▼
                          Slack · email · six web surfaces · evidence share links
```

Cross-cutting: `packages/ai` (every model call) · jobs platform (every background step) · cost telemetry + tracing (every dollar and trace).

## Doc index

| # | Doc | Engine |
|---|---|---|
| 1.1 | [phase-1/01-data-model](phase-1/01-data-model.md) | Six primitives, two-layer schema, org scoping, pgvector |
| 1.2 | [phase-1/02-ai-platform](phase-1/02-ai-platform.md) | `packages/ai`: routing, structured outputs, evidence discipline, evals |
| 1.3 | [phase-1/03-jobs-platform](phase-1/03-jobs-platform.md) | Hybrid jobs platform (CF firehose + Trigger.dev pipelines) + job conventions |
| 1.4 | [phase-1/04-collection-engine](phase-1/04-collection-engine.md) | Source discovery, shared fetching, adaptive scheduling |
| 1.5 | [phase-1/05-diff-evidence-engine](phase-1/05-diff-evidence-engine.md) | Change detection funnel, fact extraction, evidence records |
| 1.6 | [phase-1/06-context-engine](phase-1/06-context-engine.md) | AI interview, BusinessContext, Intelligence Plan, freshness |
| 1.7 | [phase-1/07-scoring-engine](phase-1/07-scoring-engine.md) | Grounding, severity, dedup, feedback loop, insights v1 |
| 1.8 | [phase-1/08-briefing-engine](phase-1/08-briefing-engine.md) | Weekly briefing, Baseline Dossier, QA gate |
| 1.9 | [phase-1/09-alerts-delivery](phase-1/09-alerts-delivery.md) | Routing matrix, Slack app, email, delivery mechanics |
| 1.10 | [phase-1/10-ask-engine](phase-1/10-ask-engine.md) | Hybrid retrieval, cited answers, refusal |
| 1.11 | [phase-1/11-battlecard-engine](phase-1/11-battlecard-engine.md) | Event-driven cards with edit safety |
| 1.12 | [phase-1/12-web-app](phase-1/12-web-app.md) | The six surfaces |
| 1.13 | [phase-1/13-observability-cost](phase-1/13-observability-cost.md) | Cost telemetry, margin dashboard, tracing |
| 2.1 | [phase-2/01-module-framework](phase-2/01-module-framework.md) | Module manifest + Product & Market Watch |
| 2.2 | [phase-2/02-outcome-tracking](phase-2/02-outcome-tracking.md) | Actions → outcomes → scoring feedback |
| 2.3 | [phase-2/03-paid-sources](phase-2/03-paid-sources.md) | Tier-2 providers behind the economics gate |
| 3.1 | [phase-3/01-fusion-engine](phase-3/01-fusion-engine.md) | Cross-module correlation, backtested pattern library |
| 3.2 | [phase-3/02-workflow-layer](phase-3/02-workflow-layer.md) | Mission Rooms, Board Mode, reports builder |

Phase 4 is deliberately unplanned (PRD: earned, not scheduled).

## Build order (Phase 1)

Dependencies force most of this; milestones end at demoable states.

- **M0 — Foundations:** 1.1 data model → 1.2 ai-platform → 1.3 jobs spike + wrapper. Observability contracts (1.13) implemented *inside* each from day 1.
  *Demo: seed script + a traced, cost-metered task run.*
- **M1 — The observation layer:** 1.4 collection → 1.5 diff/evidence.
  *Demo: 3 real competitors watched for a week; a real pricing change caught, diffed, rendered, shareable. The moat starts accruing here — ship M1 before the web app exists.*
- **M2 — Context & grounding:** 1.6 context engine → 1.7 scoring. Onboarding surface (part of 1.12) lands here.
  *Demo: interview → plan → activate; the same change scored differently for two different org contexts.*
- **M3 — The artifacts:** 1.8 briefings → 1.9 alerts/delivery.
  *Demo: Baseline Dossier < 24h; a real Monday briefing in Slack + email. Sellable at this point.*
- **M4 — Depth:** 1.10 Ask → 1.11 battlecards → remaining 1.12 surfaces → 1.13 admin dashboard.
  *Demo: the full six-surface journey = launch candidate.*

Phase gates between phases are the PRD exit criteria ([Part 5](../prd/05-execution.md)) — business gates, not engineering ones.

## Laws (every engine, every phase — deviations are review rejects)

1. **Evidence discipline is mechanical.** Claims carry evidence refs validated by code (`packages/ai/evidence.ts`); numbers in copy come from `extracted_facts`, never model prose. 100% evidence coverage is a query, not an aspiration.
2. **Structured outputs only.** Every model call goes through `defineTask` with Zod in/out; unvalidated prose never touches the database.
3. **Two-layer tenancy.** World-facts are global (shared cost, compounding archive); assessments are per-org via `scopedDb`. No org ID on observation tables; no per-org table without one.
4. **Immutable archive.** Snapshots, changes, evidence, delivered briefings: append-only, forever. The archive is moat #1.
5. **Honest by construction.** Coverage transparency, quiet-week mode, refusal paths, confidence caps on severity, "what would change this assessment" everywhere. Trust is the product.
6. **Every dollar attributed.** Fetches, tokens, sends → `cost_events` at the three spend gates, from the first line of code.
7. **The model judges, code decides.** Severity math, selection budgets, QA gates, pattern validation are deterministic and testable; LLMs produce sub-scores and prose inside schemas.
8. **Buy, don't build** (Firecrawl, WorkOS, Stripe, Cloudflare Email, R2, Langfuse...) — build only what compounds: the archive, the context graph, the scoring, the artifacts.
9. **Eval-gated AI changes.** Task and prompt changes pass their golden datasets in CI; hand-labeled real examples seed them, production `wrong` verdicts grow them.
10. **No customer homework.** Nothing anywhere asks the customer to maintain data on a schedule. If a design needs it, the design is wrong.
