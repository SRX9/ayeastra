# 05 — Roadmap, Risks & Decisions

*Part of the [AyeAstra PRD](README.md). The build order, the ranked risks, open decisions, and glossary.*

---

## Roadmap

Each phase must be sellable on its own AND feed the fusion moat. No phase starts before the previous phase's exit criteria are met.

### Phase 1 — Launch: Competitive Watch

Scope is exactly [Part 3](03-product.md): six surfaces, Tier-1 sources, diff archive, weekly briefing, alerts, Ask, battlecards.

**Exit criteria:** 10–20 paying customers · action rate > 30% · priority-attach rate proves context grounding · ≥ 1 "would have missed this" per customer per month · briefing embedded in a weekly cadence (the churn signal to watch).

### Phase 2 — Deepen, then widen

In order:

1. **Deeper source coverage:** add paid data only when revenue supports the economics and customers ask for it repeatedly.
2. **Outcome tracking:** actions → owners → results → scoring feedback.
3. **Second module: Product & Market Watch** — same buyer family, shared entity graph. Then Brand & Narrative Watch, then Account Watch — each gated by the replacement bar.

**Exit criteria:** 30–75 customers · 30%+ adopt a second module · multi-module retention materially better · ACV moving toward $18–40k.

### Phase 3 — Fusion platform

Only after customers run multiple modules: cross-module insights with conservative confidence scoring · Mission Rooms · Board Mode and executive cadence automation · full action/outcome loops · reports builder.

**Exit criteria:** 50%+ of Business/Enterprise customers use missions or action tracking · 2+ departments consuming briefings in expansion customers · customers cite accumulated memory as a switching cost.

### Phase 4 — Verticals & ecosystem (vision)

Vertical products (Fintech Intelligence OS, VC/PE Deal Intelligence, Agency Client Monitoring) · Regulatory/Security modules if demand and resources clear the specialist bar · third-party agents on the universal contract · marketplace. None of this is planned in detail on purpose — it's earned, not scheduled.

---

## Risks, ranked

1. **The commoditization sandwich.** AI assistants (ChatGPT Pulse, Deep Research) below, AI-enabled incumbents above. *Mitigation:* the three escape features — diff archive, customer-specific grounding, workflow embedding — ship in Phase 1, not Phase 3. Anything that is "AI summarizes web pages" is table stakes, never the pitch.
2. **Interesting but not essential → churn.** The known failure mode of the CI category. *Mitigation:* anchor every briefing to decisions, actions, priorities, and timing; track actions, not opens; every pilot ends with "which insights changed a decision"; kill briefing sections that don't drive action.
3. **Hallucinated strategic claims destroy trust.** One confident wrong assessment in a pilot kills the deal. *Mitigation:* evidence chain on every material claim; conservative correlation at launch; confidence levels with "what would change this assessment"; structured outputs validated before they touch the database.
4. **Scope outruns capacity.** This PRD describes years of work; the page map alone could eat a year. *Mitigation:* six surfaces in Phase 1; one module at a time; the build-order rule; no Agents UI; defer everything in the deferred list.
5. **Source access breaks promised coverage.** LinkedIn is closed, review/social ToS are hostile. *Mitigation:* Tier-1 durable sources only at launch; coverage transparency page; paid data per-source when revenue supports it; never promise sources we don't have.
6. **Business context goes stale.** Without direct access to customer systems, context can drift if priorities change. *Mitigation:* keep the context model small, review it during recurring briefings, ask for explicit corrections when confidence depends on stale assumptions, and make priority edits fast.
7. **A weak module poisons the platform.** Buyers judge each module against the specialist. *Mitigation:* the replacement bar is a hard gate; the catalog grows slowly; pricing-page presence is earned.
8. **Crawling + inference COGS erode margin.** *Mitigation:* adaptive scheduling (match crawl frequency to observed change rates), shared caching for public sources, cheap models for classification / heavier models for synthesis, per-monitor cost telemetry from day 1.
9. **Expansion mismatch.** Selling into legal/security from a PMM landing point crosses buying centers and stalls NRR. *Mitigation:* expand within the competitive/product/market intelligence buyer family first; regulatory/security stays in Phase 4.
10. **Name and brand.** The name is AyeAstra, but trademark/domain diligence is not yet done, and Google's "Project Astra" assistant brand sits next to it in search. *Mitigation:* complete trademark + domain + handle registration before any public launch; build exact-match "AyeAstra" presence early; purge stale names (AyeWatch, Oracle) from all docs and copy.

---

## Open decisions

| Decision | Status | Notes |
|---|---|---|
| Final product name | **Decided: AyeAstra** | Diligence remaining: trademark, domain, handles; own exact-match search early (adjacency to Google's "Project Astra") |
| Launch vertical within B2B SaaS | **Decided: martech / sales-tech / RevOps SaaS** | Most competitive category, richest public sources, LinkedIn-reachable buyers; full rationale in [Part 2](02-strategy.md) |
| Paid data vendors (hiring/reviews) | **Open** | Post-revenue; evaluate Coresignal, TheirStack, G2 partnership |
| Job platform | **Decided: hybrid** — Cloudflare (Workers/Queues/Workflows) for the observation-layer firehose + Trigger.dev Cloud for per-org LLM pipelines | Decision record + split in [implementation 03](../implementation/phase-1/03-jobs-platform.md); validated by a 2-day M0 slice |

---

## Glossary

- **External context** — the outside world, collected from monitored sources.
- **Business context** — who the customer is: strategy, positioning, competitors, target segments, priorities, and current concerns captured through onboarding and feedback.
- **Agent** — internal AI process specialized in one collection/analysis domain. Implementation detail; no end-user UI.
- **Signal** — one detected change/event with evidence (source, timestamp, hash, diff).
- **Insight** — fused assessment of why multiple signals matter together.
- **Entity** — canonical thing the business cares about (competitor, product, vendor, market...).
- **Module** — a sellable intelligence app for one buyer problem (Competitive Watch, Product & Market Watch...). Listed for sale only after clearing the replacement bar.
- **Fusion** — joining signals across contexts and modules via entity resolution, temporal linking, correlation, and business grounding.
- **Briefing** — scheduled, evidence-backed summary; the Monday Competitive Briefing is the flagship.
- **Baseline Dossier** — the day-1 (and lead-magnet) landscape snapshot, produced before any diffs exist.
- **Replacement bar** — the quality gate a module must clear before being sold ([Part 2](02-strategy.md)).
- **Mission / Action / Outcome** — Phase 2–3 primitives connecting intelligence to execution and ROI.

---

*End of PRD.*
