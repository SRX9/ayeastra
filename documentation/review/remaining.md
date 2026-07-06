# AyeAstra — Remaining Implementation Backlog

The authoritative "what's left" list. Re-verified and **updated 2026-07-04 after the
job layer landed** — Section 1 (the entire remaining engineering build) is now CODE-COMPLETE.
What remains is provisioning (Section 2), runtime acceptance (Section 1.3), and business
gates (Section 3).

**One-line state:** every engine AND the job layer that connects them is built and
typechecked (283 tests repo-wide, 1 pre-existing env-dependent failure noted in §4).
The product produces its first end-to-end output as soon as the Section 2 credentials
land — no further code is required for the spine.

---

## Section 1 — Engineering: job runtime + pipeline — ✅ DONE (2026-07-04)

Landed as three new workspaces; all job defs ride the existing `@ayeastra/jobs`
contract, and the CF↔Trigger seam is plain REST both ways (no SDK crossover):

- **`packages/pipeline`** — all 13 missing job definitions, platform-neutral:
  - Observation (CF-hosted): `scheduler.tick`, `source.fetch`, `change.detect`
    (**writes `changes` + `evidence`**, renders diff HTML to R2, force-promotes pricing
    numerics, fans out `change.analyze` across the seam), `embed.upsert`.
  - Intelligence (Trigger-hosted): `change.analyze`, `signal.ground` (**writes
    `signals`**, dedup gate, novelty via pgvector, deterministic severity, insight
    groupers on insert), `signal.route`, `digest.daily`, `briefing.weekly`,
    `briefing.baseline`, `battlecard.refresh`, `delivery.send`, `context.enrich`.
  - `src/seam.ts` — Trigger REST trigger + Queues HTTP publish + Workflows REST start;
    hosts override with bindings.
- **`apps/worker`** — Cloudflare host: `wrangler.jsonc` (cron */15, fetch/detect/embed
  queues + DLQs, R2, Hyperdrive, DO politeness semaphore), queue consumers via the CF
  adapter, `DomainSemaphore` DO (max 2/domain, expiring leases), `SourceDiscoverWorkflow`
  (paths → classify-page-kind → feeds → news).
- **`apps/trigger`** — Trigger.dev host: `trigger.config.ts`; all 9 pipeline tasks + the
  6 pre-existing jobs (fusion ×3, mission ×2, board) registered via `toTriggerTask`;
  per-org TZ schedules (`schedule.sync` upserts digest 08:00 + briefing day-of-week via
  `schedules.create`), declarative crons for fusion daily/weekly, missions weekly,
  board quarterly.
- **Web wiring** — plan activation triggers `briefing.baseline` + `context.enrich`
  (credential-gated no-op without `TRIGGER_SECRET_KEY`); mission close triggers
  `mission.retro`. `deliveries` gained a `meta jsonb` column (digest signal-ID sets) —
  needs one `bun db:push`.

### 1.3 — First end-to-end smoke path (runtime acceptance — needs credentials)

- [ ] CF cron tick → fetches through the `fetch` queue (DO semaphore + DLQ) →
  `change.detect` → REST-trigger `change.analyze` → signal + deliveries written;
  double-trigger is a no-op; two org-TZ schedules fire correctly.
- [ ] **Milestone demo (M3):** a real competitor pricing change caught, diffed, scored
  per-org, and landing in a Monday briefing delivered to email + Slack.

### Known code-level follow-ups (deliberate scope cuts, not blockers)

- robots.txt cache + per-source block-ignore list + A/B flapping detector (diff doc guards).
- EDGAR + app-store discovery steps (need CIK/iTunes resolvers).
- Non-pricing extractors (changelog/careers) — changes degrade to diff-only facts.
- Quiet-hours + per-user mutes in `signal.route` (needs the Settings surface; passes null/[] today).
- Slack OAuth/Block-Kit interactivity (sends use the context's incoming webhook).
- Global daily fetch-spend budget guard.

---

## Section 2 — Provisioning: credential/infra gates (code exists, inert until set)

`.env.example` now exists at the repo root documenting the full surface. Remaining:

- [ ] **Postgres** (pgvector) + `bun db:push` (picks up `deliveries.meta`).
- [ ] **Cloudflare** — account; create queues (`ayeastra-fetch/detect/embed` + `-dlq` ×3),
  R2 bucket `ayeastra-snapshots`, Hyperdrive config (paste id into `wrangler.jsonc`),
  Email Routing/Sending; `wrangler secret put` the worker secrets; `wrangler deploy`.
- [ ] **Trigger.dev** — cloud project; set `TRIGGER_PROJECT_REF` + `TRIGGER_SECRET_KEY`;
  `bun run --cwd apps/trigger deploy`; run `schedule.sync` once.
- [ ] **LLM provider** — `LLM_*` keys; unblocks live `bun eval` gates + the AI interview.
- [ ] **Langfuse** — tracing keys.
- [ ] **Firecrawl** — `FIRECRAWL_API_KEY` (worker secret).
- [ ] **Stripe dashboard** — products/prices incl. module add-on lookup keys
  (`module_product_market_watch_monthly|annual`); wire webhook → entitlements.
- [ ] **Slack** — org incoming webhooks (delivery slice) now; OAuth app + signing secret
  for interactive alerts later.
- [ ] **Paid data providers (Phase 2.3)** — Coresignal / TheirStack / G2 keys.

---

## Section 3 — Business gates (deliberate; not code, not credentials)

Per PRD [Part 5 execution](../prd/05-execution.md):

- [ ] **G2 partnership** before review intelligence ships (Phase 2.3).
- [ ] **PMW replacement-bar beta metrics** before listing PMW on the pricing page.
- [ ] **Fusion activation preconditions** — archive depth + ≥2 live modules +
  design-partner validation (Phase 3 exit).

---

## Section 4 — Repo hygiene / risks

- [x] **`.git` health** — verified working 2026-07-04 (status/stash/diff all clean).
- [ ] **Pre-existing test failure:** `packages/db/src/cost-rollups.test.ts` fails on this
  machine ("anomaly rule" trailing-mean assertion) with or without the new code — it runs
  against the live dev DB and is timezone/day-boundary sensitive. Fix the test's day
  bucketing or run against a UTC database.

---

### What is NOT remaining (built & tested — don't rebuild)

All pure engines (`db`, `ai`, `jobs`, `collection`, `diff`, `core`, `scoring`,
`briefing`, `delivery`, `battlecards`, `ask`, `modules`, `outcomes`, `providers`,
`fusion`, `workflow`), **the entire job layer (`pipeline` + `worker` + `trigger`)**,
all web surfaces, auth/RBAC/billing code, Stripe webhook handler, Express outcomes
routes. These need **credentials flowing in** (Section 2), not more code.
