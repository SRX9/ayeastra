# 12 — Web App: The Six Surfaces (Phase 1)

Exactly six surfaces ([PRD Part 3](../../prd/03-product.md)) — if it doesn't serve the Monday briefing or the alert loop, it doesn't exist. Builds on what's already shipped in `apps/web`: WorkOS auth + org guard (`requireOrg`), Settings (team, billing), HeroUI + Tailwind v4, streamdown/tiptap/recharts already in deps.

## The bar

Incumbent CI dashboards are dense analyst consoles nobody opens twice; the PRD is explicit that feeds get ignored and analysts get consulted. The bar: **every screen answers "what changed, why it matters, what to do"** within one glance, evidence is always one click away, and the diff viewer is beautiful enough to screenshot into a board deck — the UI itself is a distribution artifact.

## Routes

```
/onboarding            interview chat → plan review → activate     (context-engine)
/dashboard             intelligence feed
/entities              watched entities grid
/entities/[id]         entity detail: timeline · diffs · coverage · battlecard · summary
/briefings             archive          /briefings/[id]   reader
/ask                   threads + chat
/evidence/[id]         public share route (token-gated, no auth)
/settings/*            org · team · billing (exist) + context · delivery · learned-behavior
```

Guard changes: `/dashboard` additionally requires an activated Intelligence Plan (else → `/onboarding`); `/evidence/[id]` joins the proxy's public list.

## Surfaces

### Onboarding
Streaming interview chat (stage progress, "did you know" enrichment cards sliding in) → Intelligence Plan review (editable entity/source/routing tables, explicit "not covered" honesty block) → Activate → expectation-setting screen ("Baseline today; intelligence starts when things change").

### Dashboard (the feed)
- `SignalCard`: severity chip · finding · why-it-matters (grounded, priority tags visible) · evidence link · confidence · quick actions (acknowledge / assign / snooze / dismiss) · feedback (useful / not useful / wrong / already knew).
- Filters: severity, entity, category, date; cursor pagination (server components + server actions; no client data library unless proven needed).
- Cold-start empty state: "watching N sources across M competitors — first signals land when something changes" + link to Baseline Dossier. The cold start is honest by design.

### Entities
Grid → detail. Detail composes what other engines expose:
- **Timeline** — signals + changes, chronological.
- **Diff archive** — the signature surface. `DiffViewer`: side-by-side / inline toggle, sticky evidence header (source URL · fetched timestamps · content hash chip), pricing diffs render the structured plan-matrix comparison above the raw diff, screenshot pane where captured, share button (mints evidence token).
- **AI summary** — "everything AyeAstra knows about X" (Ask engine, fixed prompt, cached until next signal).
- **Coverage panel** — exactly which sources are watched, cadence, health, "last checked" (collection engine's transparency contract).
- **Battlecard tab** — view/edit (battlecard doc), score-trend sparkline (recharts).

### Briefings
Archive list → reader: section AST → React components, evidence chips inline, per-section feedback, impact-map section rendered as priority×signal matrix, "create action" on recommendations. Print CSS (briefings get exported to PDF for boards).

### Ask
Thread sidebar + streaming chat (streamdown), citation chips → evidence/signal links, suggested questions on empty state.

### Settings (extend existing)
`/settings/context` (edit priorities/competitors/positioning — context versions), `/settings/delivery` (routing matrix, Slack connect, channel health, delivery history), `/settings/learned` (scoring multipliers visible + resettable, mutes).

## Component inventory (shared, `packages/ui` or `apps/web/src/components`)

`SeverityChip` · `ConfidenceBadge` · `EvidenceChip` (hash+timestamp popover) · `SignalCard` · `DiffViewer` · `EntityTimeline` · `CoveragePanel` · `BriefingSection` renderers · `FeedbackControl` · `PriorityTag`. `DiffViewer` and `EvidenceChip` get the most design attention — they carry the trust story.

## Build checklist (ordered to unblock demos earliest)

1. Shell: nav for six surfaces, plan-activation guard, empty states.
2. Onboarding surface (with context engine).
3. Dashboard feed + `SignalCard` + filters + feedback wiring.
4. Entity detail: `DiffViewer` + coverage panel first (demo-critical), then timeline/summary.
5. Briefing reader + archive.
6. Ask surface.
7. Settings extensions + `/evidence/[id]` public route.

## Acceptance

- Full journey clickable on the seed org: signup → interview → plan → activate → baseline → feed → entity diff → briefing → ask — no dead ends, every empty state intentional.
- Every material claim on every surface has a working evidence affordance (spot-check automated on seeded data).
- DiffViewer screenshot passes the "board deck" test; public evidence link renders clean without auth.
- Feedback controls on signals and briefing sections write rows end-to-end (visible in `/settings/learned`).
