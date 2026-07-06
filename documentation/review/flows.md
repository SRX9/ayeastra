# AyeAstra — Flows & Journeys Review Map

A complete index of the system's user journeys, feature flows, and logic/pipeline
flows. Each entry has a stable **ID**, its **purpose**, the **entry files**, and the
**path** (ordered steps through the code). Feed me any ID (or a range like "review UJ‑2,
FW‑3") and I'll trace and review the entire path end‑to‑end.

Legend for status tags used below:
- `LIVE` — code implemented and wired.
- `GATED` — code exists but inert until a credential/infra/business dependency lands.
- `MISSING` — spec'd but no production code exists yet (the observation→intelligence
  glue; see `phase-1-m0-status`). Reviewing these = reviewing the spec + call sites that
  expect them.

---

## A. User Journeys (end‑to‑end, human‑facing)

> Full stories a real user lives through, crossing many surfaces. Best for "does the
> whole thing hang together" reviews.

- **UJ‑1 — Anonymous visitor → signed‑up user.**
  Marketing page → sign up → AuthKit → callback → dashboard.
  Path: `app/(marketing)/page.tsx` → `app/signup/route.ts` → WorkOS AuthKit →
  `app/callback/route.ts` (mirrors user into `users` table, best‑effort) → redirect
  `/dashboard`. Guards: `lib/auth.ts` `requireAuth`.

- **UJ‑2 — New user → active organization → onboarded intelligence plan.**
  First login with no org → `/onboarding` → create/join org → `/onboarding/context`
  (business‑context interview / manual activation) → dashboard unlocks.
  Path: `requireOrg` redirect → `app/(flow)/onboarding/page.tsx` +
  `actions.ts` → `app/(flow)/onboarding/context/page.tsx` + `actions.ts` →
  `@ayeastra/core` interview stage machine + versioned `business_context` write →
  dashboard guard `currentContext()` passes.

- **UJ‑3 — Trial/unpaid org → paid subscription.**
  Any gated page → `/settings/billing` paywall → Stripe Checkout → webhook writes
  entitlement to WorkOS org metadata → app unlocks.
  Path: `requireActiveSubscription` redirect → `app/(app)/settings/billing/page.tsx` +
  `plan-cards.tsx` + `actions.ts` → Stripe → `app/api/webhooks/stripe/route.ts` →
  `lib/billing.ts`. (See FW‑9, LF‑10.)

- **UJ‑4 — Weekly intelligence consumer.**
  Receives weekly briefing (email/Slack) → opens web reader → drills into a signal →
  opens evidence → creates an action.
  Path: LF‑6 briefing gen → LF‑8 delivery → `app/(app)/briefings/[id]/page.tsx` →
  `signal-card` → `app/(public)/evidence/[id]` → action create (LF‑9).

- **UJ‑5 — Analyst asking a question.**
  Types a question in Ask → retrieval → grounded answer with citations (or honest
  refusal) → follow‑up in same thread.
  Path: `app/(app)/ask/page.tsx` + `actions.ts` → `@ayeastra/ask` pipeline (LF‑7).

- **UJ‑6 — Competitor deep‑dive.**
  Entities grid → entity detail → coverage/timeline/battlecard → share evidence.
  Path: `app/(app)/entities/page.tsx` → `[id]/page.tsx` (+ `@modal` intercept route) →
  battlecard view (LF‑5).

- **UJ‑7 — Running a Mission.**
  Create a standing question → AI expands watch spec → mission auto‑briefs → close with
  retrospective.
  Path: `app/(app)/missions/page.tsx` + `actions.ts` → `[id]/page.tsx` →
  `@ayeastra/workflow` + jobs `mission.brief`/`mission.retro` (LF‑11).

- **UJ‑8 — Quarterly board readout.**
  Board Mode assembles the executive artifact → reviewed on `/board` → exported as report.
  Path: `app/(app)/board/page.tsx` → `board.assemble` job → `app/(app)/reports` +
  `reports/[id]/markdown/route.ts` (LF‑11, LF‑12).

- **UJ‑9 — Admin/ops oversight.**
  Cost dashboard + action metrics, ADMIN_EMAILS‑gated.
  Path: `app/(app)/admin/page.tsx` → rollups in `@ayeastra/db` (LF‑13).

- **UJ‑10 — Team administration.**
  Invite members, assign roles, manage the org.
  Path: `app/(app)/settings/team/page.tsx` + `actions.ts` → `lib/team.ts` →
  `@ayeastra/auth` roles.

- **UJ‑11 — Tuning the feed.**
  Give feedback on signals (useful/wrong/already‑knew) → learned weights shift →
  mute offers → reset weights.
  Path: `signal-card` feedback action → `@ayeastra/scoring` multipliers →
  `org_scoring_weights` → `app/(app)/settings/learned/page.tsx` + `actions.ts` (LF‑4).

- **UJ‑12 — Enabling a module.**
  Activate Product & Market Watch add‑on → PMW onboarding slice → new categories flow
  into briefings.
  Path: `app/(app)/settings/modules/page.tsx` + `actions.ts` → `@ayeastra/modules`
  entitlements → `org_modules` (LF‑14).

---

## B. Web Feature Flows (per surface)

> One surface each: its guards, reads, and form/server actions. Best for
> per‑page correctness + auth‑isolation reviews.

- **FW‑1 — Dashboard feed.** `app/(app)/dashboard/page.tsx` + `actions.ts`.
  Guard: `requireActiveSubscription` + `currentContext` (→ `/onboarding/context`).
  Reads: `lib/intel.ts` `listSignals` (cursor pagination), `listWatchedEntities`,
  `watchStats`, `listOpenActions`. Actions: signal feedback + status (ack/dismiss/snooze),
  action create/close. Note URL enum/uuid guards at top of page.

- **FW‑2 — Entities grid & detail.** `app/(app)/entities/page.tsx`, `[id]/page.tsx`,
  `@modal/(.)entities/[id]/page.tsx` (intercepting modal route). Coverage table, timeline,
  battlecard render. Reads via `lib/intel.ts`.

- **FW‑3 — Briefings archive & reader.** `app/(app)/briefings/page.tsx`, `[id]/page.tsx`.
  Renders the briefing AST; section‑level feedback.

- **FW‑4 — Ask surface.** `app/(app)/ask/page.tsx` + `actions.ts`.
  Full retrieval/answer pipeline inside the server action, honest no‑LLM degradation.
  Thread ownership checks. (Logic in LF‑7.)

- **FW‑5 — Public evidence share.** `app/(public)/evidence/[id]/page.tsx`.
  Token‑gated (`?t=`), no auth. DiffViewer: pricing‑delta matrix + sandboxed diff iframe.
  Review focus: token check, cross‑org leakage, iframe sandboxing.

- **FW‑6 — Onboarding (org).** `app/(flow)/onboarding/page.tsx` + `actions.ts`.

- **FW‑7 — Onboarding (context).** `app/(flow)/onboarding/context/page.tsx` + `actions.ts`.
  Manual context activation + interview merge into versioned `business_context`.

- **FW‑8 — Settings/context.** `app/(app)/settings/context/page.tsx`. Versioned edits.

- **FW‑9 — Settings/billing.** `page.tsx` + `actions.ts` + `plan-cards.tsx` +
  `manage-billing-button.tsx`. Checkout + portal. Plan escalation logic (LF‑10).

- **FW‑10 — Settings/learned.** `page.tsx` + `actions.ts`. View + reset learned weights.

- **FW‑11 — Settings/modules.** `page.tsx` + `actions.ts`. Module activation + PMW slice.

- **FW‑12 — Settings/team.** `page.tsx` + `actions.ts`. Invites, role assignment
  (`canManageRole` guard), `lib/team.ts`.

- **FW‑13 — Missions.** `app/(app)/missions/page.tsx` + `actions.ts`, `[id]/page.tsx`.

- **FW‑14 — Board.** `app/(app)/board/page.tsx`.

- **FW‑15 — Reports.** `app/(app)/reports/page.tsx`, `[id]/page.tsx`,
  `[id]/markdown/route.ts` (export).

- **FW‑16 — Admin.** `app/(app)/admin/page.tsx`. ADMIN_EMAILS gate.

- **FW‑17 — App shell.** `app/(app)/layout.tsx` (`OsShell`, menu‑bar telemetry, modal slot).
  Light auth guard only; strict gates live in pages.

---

## C. Auth & Access‑Control Flows

- **AC‑1 — Sign in / sign up / callback.** `app/login/route.ts`, `app/signup/route.ts`,
  `app/callback/route.ts` (WorkOS AuthKit `handleAuth`, user mirror).

- **AC‑2 — Session guards ladder.** `lib/auth.ts`:
  `requireAuth` → `requireOrg` (→`/onboarding`) → `requireActiveSubscription`
  (→`/settings/billing`) → `requireRole` (returns error, never throws).
  Org fetch deduped via React `cache`.

- **AC‑3 — Roles & RBAC.** `@ayeastra/auth` `roles.ts`: `member|admin|owner`,
  `hasRoleAtLeast`, `canManageRole` (used by team actions).

- **AC‑4 — Token verification.** `@ayeastra/auth` `token.ts` `createTokenVerifier` (JWKS).

- **AC‑5 — Org data isolation (data‑model law #3).** `scopedDb(orgId)` — every per‑org
  table read/written only through it; `workos_org_id` leads every index. Review focus:
  any raw `getDb()` touching per‑org tables = a leak. (`lib/intel.ts` is the read layer.)

---

## D. Logic / Pipeline Flows (the engine)

> The observation→intelligence pipeline and the deterministic engines. Best for
> algorithm‑correctness and honesty‑law reviews. **Note the MISSING tags** — several
> pipeline stages are spec'd with no production writer yet.

- **LF‑1 — Collection / snapshot.** `MISSING` wiring.
  `@ayeastra/collection`: FetchProvider/Firecrawl, BlobStore, `captureSnapshot`
  (live‑verified but **never called by any job**), adaptive scheduling, failure ladder,
  discovery helpers. Writes → `snapshots`. Review: the engine + the absent job edge.

- **LF‑2 — Change detection.** `MISSING` wiring.
  `@ayeastra/diff`: versioned normalizer + hash gate, block splitter, patience diff, HTML
  diff render, pricing force‑promotion, `comparePricing`, share tokens. Would write
  `changes` + `evidence`. No production writer exists (only a test writes these tables).

- **LF‑3 — Change analysis / grounding → signals.** `MISSING` wiring.
  `@ayeastra/ai` tasks `classify-change`, `extract-pricing`, `classify-page-kind`,
  `ground-signal`, `extract-context-slice`; scoring in LF‑4. Would turn global `changes`
  into per‑org `signals`. Consumers (briefing/board/ask/fusion/feeds) all read the
  resulting tables, which stay empty until this lands.

- **LF‑4 — Signal scoring & feedback.** `LIVE` (engine).
  `@ayeastra/scoring`: deterministic `scoreSignal` (hard rules — CRITICAL gate,
  confidence/context‑neutral caps), `dedupKey` + cosine + novelty, feedback multipliers
  (wrong→review, mute offers after 3 consecutive negatives), insight rule groupers.
  Persists to `signals.scores`, `org_scoring_weights`. (UI: UJ‑11/FW‑10.)

- **LF‑5 — Battlecards.** `LIVE` (engine).
  `@ayeastra/battlecards`: section provenance (`auto|edited`), edit‑safe `applyRefresh` /
  `applyEdit`, category→section refresh mapping. Table `battlecards`.

- **LF‑6 — Briefing generation.** `LIVE` (engine), `MISSING` inputs.
  `@ayeastra/briefing`: selection budgets + cross‑section dedup + quiet‑week, QA gate
  (numeric cross‑check, confidence lint), `orchestrateBriefing` pipeline
  (select → global F‑refs → synth/section w/ QA regenerate‑once‑then‑drop → exec last →
  derived sections → AST), renderers (web AST, email HTML+plaintext, Slack Block Kit).
  Module‑merged sections + budget rebalance (LF‑14). Reads `signals`/`insights` (empty
  until LF‑3). Table `briefings` (unique org/kind/period → idempotent retries).

- **LF‑7 — Ask retrieval & answer.** `LIVE`.
  `@ayeastra/ask`: org‑isolated hybrid retrieval (vector + keyword + changes via
  `org_entities` join), RRF merge, deterministic refusal gate + honest copy, thread
  persistence with ownership checks; tasks `parse-ask-query`, `rerank-results`,
  `answer-ask`, `suggest-questions`. Tables `ask_threads`/`ask_messages`.

- **LF‑8 — Delivery / routing.** `LIVE` (engine), `GATED` (channels).
  `@ayeastra/delivery`: `routeSignal` guards (delivery matrix, quiet hours, family dedup,
  mutes, `module_inactive` gate), EmailProvider + CloudflareEmailProvider. Table
  `deliveries` (attempts, status). Gated on Slack/email creds.

- **LF‑9 — Outcomes / actions loop.** `LIVE` (web), `GATED` (Slack).
  `@ayeastra/outcomes`: `open|done|dropped` transitions, HMAC close tokens, Slack
  signature/interaction parsing, budget pressure, quarterly value recap; `applyActionTaken`
  scoring hook (×1.15). Web one‑click create/close on signal card / briefing / dashboard.
  Routes `api/actions/close`, `api/slack/interactions`. Tables `actions`, `outcomes`.

- **LF‑10 — Billing sync.** `GATED` (Stripe creds).
  `app/api/webhooks/stripe/route.ts` → entitlement write to WorkOS org metadata +
  `lib/billing.ts`. Plan escalation, module add‑on prices, `past_due` = banner not lock.

- **LF‑11 — Missions & Board (workflow).** `LIVE` (engine), `GATED` (Trigger.dev).
  `@ayeastra/workflow`: mission templates/lens/lifecycle, WatchSpec parse, Board Mode
  assembler (rides `briefings` kind `board`), `workflowEntitled` (business/enterprise).
  Tasks `expand-mission`, `mission-brief`, `mission-retro`. Jobs `mission.brief`,
  `mission.retro`, `board.assemble` (`packages/workflow/src/jobs.ts`).

- **LF‑12 — Reports.** `LIVE`. ReportLayout v1 (zod), composable blocks over existing
  objects (never new unevidenced prose), markdown export route.

- **LF‑13 — Cost & metrics rollups.** `LIVE`.
  `@ayeastra/db`: `costPerOrg/Source/TaskDay`, `orgCostAnomalies` (3× trailing 14‑day
  mean), `orgActionMetrics`, `insightFeedbackStats`. `cost_events` tracing from `@ayeastra/ai`.

- **LF‑14 — Modules framework.** `LIVE`.
  `@ayeastra/modules`: manifest/registry/entitlements; Competitive Watch (implicit, no
  row) + Product & Market Watch (add‑on row in `org_modules`). Category→module ownership;
  `signals.module_key` stamped at creation; keyword‑feed discovery for market entities;
  `analyze-market-item` task. Briefing budget rebalance (TOTAL_THEMED_BUDGET 13).

- **LF‑15 — Paid data providers.** `GATED` (provider keys, G2 partnership).
  `@ayeastra/providers`: DataProvider interface; Coresignal/TheirStack/G2 adapters; pure
  ingest → `changes` via `classify-change` (hiring_data/review_data rubrics); economicsGate
  (15% / 5‑requests), providerPlanGate (Business+).

---

## E. Fusion Engine Flows (Phase 3.1)

- **FU‑1 — Observe.** `fusion.observe` job (`packages/fusion/src/jobs.ts`). Ingests global
  changes into fusion's series.

- **FU‑2 — Scan / detect.** `fusion.scan` job. Poisson‑tail burst + mean‑referenced
  winsorized CUSUM inflection detectors; cohort co‑movement over `competes_in` graph;
  governor caps 2 insights/org/week. Writes `insights` (kinds `deviation`/`correlation`/
  `pattern`).

- **FU‑3 — Backtest & pattern validation.** `fusion.backtest` job. One TriggerSpec DSL runs
  live AND backtest (no‑lookahead by construction); Wilson‑gated validation lifecycle
  (branded `ValidatedPattern` — candidate→user is a compile error); lead‑lag miner with
  Benjamini‑Hochberg FDR auto‑generates candidates; prediction ledger with live
  decay→retirement. Seeds `SEED_PATTERNS` here (avoids db→fusion cycle). Task
  `verify-insight` (threshold 0.8). Tables `patterns`, `pattern_predictions`.

- **FU‑4 — Insight surfacing & feedback.** Briefing "Connected intelligence" derived
  section; `feedback_target_type=insight` powers the >70% useful‑rate metric
  (`insightFeedbackStats`).

---

## F. Cross‑Cutting Concerns (review as themes across all flows)

- **XC‑1 — Org isolation everywhere.** `scopedDb` discipline; every per‑org query
  org‑scoped. (See AC‑5.)
- **XC‑2 — Honesty laws.** Confidence notes ("what would change this"), citation
  validation, deterministic refusal gates, no unevidenced prose. Present in LF‑3/6/7/12,
  FU‑3.
- **XC‑3 — Append‑only / idempotency (laws #4).** snapshots/changes/evidence/briefings
  append‑only; unique keys make job retries idempotent (`onConflictDoNothing`).
- **XC‑4 — Cost attribution (law #6).** Every vendor dollar attributed via `cost_events`
  + rollups (LF‑13); `cost_vendor` enum.
- **XC‑5 — Jobs contract.** `@ayeastra/jobs` `defineJob`, CF queue + Trigger.dev adapters,
  dead‑letter writer. All engines are pure; jobs are the thin impure edge.
- **XC‑6 — Entitlements & plan gates.** Module entitlements, provider plan gate, workflow
  entitlement, subscription gate — several independent checks; review for consistency.
- **XC‑7 — Data model.** `packages/db/src/schema/{observation,intelligence,fusion,ops,
  billing,enums}.ts` — two‑layer (global observation vs per‑org intelligence).

---

## G. Known Gaps to Keep in Mind While Reviewing

- The **observation→intelligence glue is MISSING code** (LF‑1/2/3): no production writer
  for `changes`/`evidence`/`signals`; `captureSnapshot` never called; ~14 spec'd jobs
  (`scheduler.tick`, `source.fetch`, `source.discover`, `change.detect`, `embed.upsert`,
  `change.analyze`, `signal.ground`, `signal.route`, `digest.daily`, `briefing.weekly`,
  `briefing.baseline`, `battlecard.refresh`, `delivery.send`, `context.enrich`) are
  unimplemented. Every downstream consumer reads currently‑empty tables. This is the
  single biggest correctness caveat for any end‑to‑end review.
- **Credential/infra‑gated:** CF Workers/R2/Email, Trigger.dev app, Slack OAuth, Stripe
  dashboard, Firecrawl, LLM keys, Langfuse — engines exist, wiring waits on accounts.
- **Repo `.git` reported broken** in prior sessions — verify before relying on git history.

---

### How to drive a review
Reply with, e.g.:
- `review UJ‑4` — trace the full weekly‑consumer journey across surfaces.
- `review LF‑6, LF‑8` — deep‑review briefing generation + delivery together.
- `review AC‑*` / `review XC‑1` — audit a cross‑cutting theme across the whole codebase.
- `review FW‑5` — one surface (evidence share) for auth/token/leak bugs.
