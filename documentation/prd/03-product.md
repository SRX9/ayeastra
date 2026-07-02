# 03 — Product

*Part of the [AyeAstra PRD](README.md). The data model, the launch product spec, source strategy, user journey, and what is deliberately deferred.*

---

## Data model: six primitives

Everything in the product attaches to one of these. All six are modeled in the schema from day 1; Mission and Outcome activate in later phases.

| Primitive | What it is | Key fields |
|---|---|---|
| **Entity** | A thing the business cares about: competitor, product, market, vendor, person | Canonical name + aliases, type, profile, score trend, full history |
| **Signal** | One detected change or event, with evidence | Source URL + timestamp + content hash, before/after diff, detecting agent, related entities, severity (CRITICAL/HIGH/NOTABLE/INFO), confidence (HIGH/MODERATE/LOW), finding, recommended action |
| **Insight** | A fused assessment of why multiple signals matter *together* | Constituent signals, detected pattern, business-context analysis, forward look, recommended actions |
| **Action** | The next step generated from a signal or insight | Description, owner, status, due date, linked objects |
| **Mission** *(Phase 3)* | A business priority intelligence should support ("defend against X," "launch in Brazil") | Goal, entities, filtered signals/insights, owners, KPI impact |
| **Outcome** *(Phase 2+)* | What changed after action was taken | Action link, KPI affected, evidence, feedback into scoring |

Internally, collection runs as specialized **agents** (one per intelligence domain) on a universal contract: intake tasking → collect via shared crawler → analyze with domain-specific LLM prompts → output structured, Zod-validated Signals → dedupe, score, route. Adding a capability = adding an agent. **Agents are an implementation detail — they get no end-user UI in Phase 1.**

---

## Launch product: Competitive Watch

One module, excellent. Must-haves:

1. **AI onboarding interview** (~10 min) — company, competitors, market, positioning, priorities, delivery preferences. Produces the static business context and a reviewable Intelligence Plan. Manual setup path in Settings as fallback.
2. **Entity setup** — competitors, their products, the customer's market/segments.
3. **Durable-source monitors** (see source strategy below) — websites, pricing pages, changelogs, blogs, careers pages, filings, news.
4. **Diff & evidence archive — the signature surface.** Before/after snapshots of every change, timestamped, hash-verified, permanent, shareable. This is what demos, screenshots, and trust are built on.
5. **Weekly Competitive Briefing** — the Monday artifact ([Part 2](02-strategy.md) defines contents). Slack + email delivery.
6. **Real-time alerts** — CRITICAL/HIGH signals to Slack/email immediately; NOTABLE batched daily; INFO weekly.
7. **Ask AyeAstra** — natural-language queries over collected intelligence ("What has PayBridge done in the last 30 days?"), every answer evidence-backed.
8. **Battlecards** — generated and auto-refreshed per competitor; exportable.
9. **Feedback controls** — useful / not useful / wrong / already knew, on every signal and briefing section. Feeds scoring.
10. **Coverage transparency** — a per-competitor "what we watch" page listing exactly which sources are monitored and how often. Honesty about coverage is a trust feature, not an admission of weakness.

No customer-system access is required for Phase 1. The product must activate from onboarding context, public sources, feedback, and explicit user edits.

---

## Source strategy: three tiers

| Tier | Sources | Status |
|---|---|---|
| **1 — Durable (launch)** | Competitor websites, pricing pages, changelogs, blogs, docs, careers pages, press releases, SEC/regulatory filings, app-store listings, public news | Legally safe, cheap, sufficient for a great product |
| **2 — Paid (post-revenue)** | Hiring data (Coresignal, TheirStack), review data (G2 partnership/API), social listening | Added when revenue supports the economics, per-source |
| **3 — Excluded** | LinkedIn scraping, ToS-violating scraping of review/social platforms | Not worth the legal and platform risk; revisit only via official APIs/partnerships |

The launch briefing promises only what Tier 1 delivers. We never pretend to watch sources we can't durably access — the coverage transparency page makes this explicit.

---

## User journey

1. **Sign up (30 seconds)** — email/OAuth via WorkOS, create org.
2. **AI interview (10 minutes)** — the five-stage conversation. Real-time background lookups surface things the user didn't know about their own competitors (first "huh" moment).
3. **Plan review (2 minutes)** — generated Intelligence Plan: entities, sources to be watched, alert routing, briefing schedule. User tweaks, clicks **Activate**.
4. **Day 1 — Baseline Dossier.** Honest cold start: with no monitoring history there are no diffs yet, so day 1 delivers a thorough competitive landscape snapshot (positioning, pricing, recent moves, review themes from accessible sources) plus confirmation of everything now being watched. Impressive, but explicitly framed as the baseline.
5. **Week 2+ — the real product begins.** First diffs land, first briefing maps changes to strategy, positioning, product priorities, and competitive narrative. We set this expectation explicitly during onboarding: *"AyeAstra gets sharper every week — the baseline is day 1; the intelligence starts when things change."*
6. **Ongoing rhythm** — Monday briefing → real-time alerts during the week → Ask on demand → battlecards always current. Month 3+: temporal patterns. Year 1: institutional memory that survives team turnover.

---

## Phase 1 surfaces (exactly six)

1. **Onboarding** — the interview + plan review.
2. **Dashboard** — intelligence feed: chronological, filterable (severity, entity, date), quick actions (acknowledge, assign, dismiss, snooze).
3. **Entities** — list + detail. Detail page: timeline of all intelligence, **diff archive**, AI summary ("everything AyeAstra knows about PayBridge"), score trend, linked briefings and actions.
4. **Briefings** — current + archive, per-section feedback.
5. **Ask** — the query interface.
6. **Settings** — org, team (owner/admin/member — fine-grained roles deferred), delivery preferences, alert routing, billing, API keys.

```
/onboarding  /dashboard  /entities  /entities/[id]  /briefings  /briefings/[id]  /ask  /settings/*
```

No Agents page, no Monitors page as a primary surface (monitor management lives inside entity detail), no Reports builder, no Missions. If a surface doesn't serve the Monday briefing or the alert loop, it doesn't exist in Phase 1.

---

## Deferred features

Everything here is deliberately *not* in Phase 1. Each item lists its earliest phase.

- **Product & Market Watch, Brand & Narrative Watch, Account Watch modules** — Phase 2, one at a time, each behind the replacement bar.
- **Outcome tracking** (actions → KPI impact → scoring feedback) — Phase 2.
- **Customer-system access** — not part of the current product. Revisit only after product-market fit and clear customer pull.
- **Mission Rooms, Board Mode, War Room, Launch/Account/Vendor Rooms** — Phase 3. High-value workflows, but they presuppose trust and multi-team adoption that must be earned first.
- **Cross-module fusion insights** — Phase 3 (requires 2+ modules live).
- **Reports builder, custom briefing scheduler** — Phase 3.
- **Fine-grained roles (analyst/viewer), SCIM, audit log, retention controls** — with first Enterprise deal.
- **Digital twins, predictive patterns, scenario modeling** — Phase 3+.
- **Regulatory Watch, Security Watch, vertical packs, agent marketplace** — Phase 4 / vision.

### Build-order rule

Every proposed item must pass at least one test, or it's deferred:

1. Does it make the current module easier to sell or harder to churn?
2. Does it make the briefing more trusted, actionable, or embedded in a recurring workflow?
3. Does it create context, memory, or workflow adoption that strengthens the fusion layer?
