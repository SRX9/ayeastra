# 04 — Collection Engine (Phase 1)

Continuous monitoring of Tier-1 durable sources ([PRD Part 3](../../prd/03-product.md)): competitor websites, pricing pages, changelogs, blogs, docs, careers pages, press releases, filings, app-store listings, news. Produces `snapshots`; the diff engine turns them into `changes`. Buy-don't-build: Firecrawl fetches, we orchestrate.

## The bar

Page watchers (Visualping class) poll fixed URLs on fixed intervals and drown users in cosmetic-change noise; incumbents rely on analysts manually adding sources. SOTA is: **auto-discovered source maps per competitor, adaptive per-source cadence driven by observed change rates, one shared fetch across all customers, and honest health status per source** (the coverage-transparency promise). Cheap where the web is quiet, fast where it's moving.

## Architecture

```
entity created ─► source.discover ─► sources rows (+ coverage page data)
cron */15m ─► scheduler.tick ─► due sources ─► source.fetch (fan-out, domain-keyed)
source.fetch ─► Firecrawl ─► R2 snapshot + snapshots row ─► change.detect (diff engine)
                              └─► monitor_state update (adaptive interval, health)
```

All state lives in `sources` + `monitor_state` + `snapshots` (data-model doc). No org ID anywhere in this engine — collection is global; orgs subscribe via `org_entities`.

**Platform (jobs doc):** this engine runs entirely on Cloudflare — `scheduler.tick` is a Worker cron trigger, `source.fetch`/`change.detect` are Queues consumers (native DLQ), `source.discover` is a Workflow. Snapshots write to R2 via binding; Postgres via Hyperdrive. Never on Vercel functions.

## Source discovery (`source.discover`)

Given an entity (name + domain), build its source map automatically:

1. **Sitemap + common paths.** Fetch `sitemap.xml`, probe common paths (`/pricing`, `/plans`, `/changelog`, `/release-notes`, `/blog`, `/careers`, `/jobs`, `/press`, `/docs`). Candidate URLs only — nothing trusted yet.
2. **Page-kind verification.** `small` task `classify-page-kind`: given URL + extracted content → `{kind, confidence}`. Only confident classifications become `sources` rows; the rest are logged for manual review during onboarding plan review.
3. **Feeds.** Detect RSS/Atom (blog/changelog) — feeds are cheaper and more precise than page diffs; prefer them where they exist.
4. **News.** One `news` source per entity via Google News RSS query (entity name + domain qualifiers). Precision handled downstream by the diff/signal layers.
5. **Filings.** Public companies: resolve CIK, subscribe to SEC EDGAR filings feed (8-K, 10-K/Q, S-1). Skip silently for private companies.
6. **App stores.** If the entity ships mobile apps (found via site links or iTunes Search API): app-store listing sources (version history = a changelog).

Output feeds the **coverage transparency page**: per entity, exactly which URLs are watched, at what cadence, current health. Discovery gaps are visible, not hidden — honesty is a trust feature.

## Fetching (`source.fetch`)

- **Firecrawl scrape** per source: markdown + raw HTML always; screenshot additionally for `pricing` (visual evidence for diffs and demos). Store all to R2: `snapshots/{sourceId}/{fetchedAtISO}-{contentHash8}.{html|md|png}`.
- **Shared fetch, global result.** One fetch per source per cycle regardless of how many orgs watch it. Upstash Redis lock (`fetch:{sourceId}`) guards against concurrent duplicates; jobs-platform idempotency key guards against replays.
- **Politeness:** per-domain concurrency cap (max 2, Durable Object semaphore — jobs doc convention 4), respect robots.txt (cache per domain, re-check weekly), identify with a stable UA. We monitor durable public pages at low frequency — stay boring and legal (Tier-3 exclusions are absolute; no LinkedIn, no ToS-hostile scraping).
- **Failure ladder:** retry (Queues backoff, exhausted → DLQ) → on repeated failure mark `degraded`; after 5 consecutive failures mark `broken`, alert internally, surface on the coverage page ("last successfully checked …"). A `broken` pricing page for a primary competitor is an internal P1 — coverage promises are the product.
- **Fallback hook:** `FetchProvider` interface with Firecrawl as the only Phase-1 implementation; Zyte/Browserless slot in behind it for hard targets when needed, without touching callers.

## Adaptive scheduling (`scheduler.tick`)

Per-source state in `monitor_state`:

- `change_rate_ewma` — exponentially weighted "did this check find a change" (α=0.3).
- On material change: `interval ← max(floor, interval × 0.5)`. On quiet check: `interval ← min(ceiling, interval × 1.3)`.
- Bounds by kind: pricing 6h–48h · changelog/blog (no feed) 6h–24h · feeds 1h–12h · careers 24h–72h · docs/homepage 24h–7d · news feed 1h–6h · filings feed 1h–6h.
- `pinned_interval` overrides everything (ops control, e.g. demo prep or a launch-day watch).
- Tick query: `next_check_at <= now()` → fan out → set `next_check_at = now() + interval`.

This is the #1 COGS lever (PRD risk #8): a static pricing page settles to 48h checks automatically; an active changelog tightens to 6h without anyone configuring anything.

## Cost controls

- Every fetch emits `cost_events` (Firecrawl credits × unit price, tagged sourceId).
- Screenshot only where it earns its cost (pricing pages).
- Feeds over page diffs wherever available.
- Global budget guard: if daily fetch spend exceeds a configured cap, ceiling-bound intervals stretch ×2 and an internal alert fires — degrade gracefully, never silently overspend.

## Build checklist

1. `FetchProvider` interface + Firecrawl impl + R2 writer + `snapshots` persistence.
2. `source.fetch` queue consumer with Redis lock, politeness semaphore, failure ladder, cost emission.
3. `scheduler.tick` + `monitor_state` adaptive logic.
4. `source.discover` (sitemap/paths → `classify-page-kind` → feeds → news → EDGAR → app stores).
5. Coverage data query (feeds the entity-detail coverage panel in the web app).
6. Seed run: 3 real martech competitors end-to-end — discovery finds pricing/changelog/blog/careers for each; scheduler sustains checks for a week.

## Acceptance

- Discovery on 5 real martech companies finds ≥ 80% of their manually-identified Tier-1 sources; misses are visible on the coverage page.
- Two orgs watching the same entity cause exactly one fetch per source per cycle (assert on `snapshots` count + Firecrawl usage).
- A quiet source demonstrably decays toward its ceiling; a changed source tightens toward its floor (inspect `monitor_state` after a simulated week).
- Killing Firecrawl (bad key) produces `degraded/broken` statuses, an internal alert, and truthful coverage-page copy — never silent gaps.
