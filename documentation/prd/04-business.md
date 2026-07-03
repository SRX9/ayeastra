# 04 — Pricing & Business Model

*Part of the [AyeAstra PRD](README.md). How packaging works, what we charge, and the numbers that define a healthy business.*

---

## Pricing principles

1. **Price against labor and missed decisions, not against monitoring tools.** The comparison is 5–15 hours/week of PMM/analyst time, a $25k Klue contract, and the cost of a competitor move caught late — not a $50/month page watcher.
2. **No empty platform fee.** Buyers hate paying an entry fee that unlocks nothing. The first module a customer buys *includes* the platform core (entity graph, evidence archive, Ask, briefings, Slack/email delivery, onboarding context, feedback loop). Modularity becomes visible from the second module onward.
3. **Modularity is flexibility, not a discount.** The pitch is "start with the department that hurts most, expand when ready, everything connects" — never "cheaper than buying tools separately." Discount-led pitches attract price-shoppers and anchor low.
4. **Three pricing axes:** which **modules** (capability) × how many **entities** monitored (scale) × how many **seats** (reach). Entities and seats give expansion revenue inside a single module — important in years 1–2 when the catalog is small.
5. **Fusion is the bundling incentive.** At 2+ active modules, cross-module insights unlock automatically. Value-based "buy more, get more."

---

## How packaging scales (the compose-your-own model)

A customer's subscription = platform core (included with first module) + chosen modules + entity/seat tier. Modules can be added or removed as needs change. The **pricing architecture** exists from day one; the **catalog** grows one module at a time, each gated by the replacement bar ([Part 2](02-strategy.md)). At launch the catalog has exactly one module, so the customer-facing pricing stays simple; the structure never needs to change as modules ship.

---

## Launch offers

| Offer | Price | What's included |
|---|---|---|
| **Baseline Dossier** (lead magnet) | Free, one-time | Competitive landscape report for 3 competitors. No ongoing monitoring. Goal: create the sales conversation. |
| **Pilot** | $1,500 / 14 days | 5–10 competitors, onboarding call, two weekly briefings, battlecard sample, success review. Fee credited to annual plan on conversion. |
| **Team** | $699/mo · $7,000/yr | Competitive Watch (incl. platform core). 5 seats, 10 entities, weekly briefing, real-time alerts, Ask, battlecards, 12 months evidence history. |
| **Business** | $1,800/mo · $18,000/yr | Everything in Team + 20 seats, 30 entities, second module (when available), role-variant briefings (exec/sales/product), early fusion insights, quarterly strategy report. |
| **Enterprise** | from $4,000/mo · $40k+/yr | Custom modules/entities/seats, SSO/SAML + SCIM, audit log, retention controls, full fusion layer (missions, board mode, outcomes), dedicated onboarding, custom briefing formats, SLA. |

Notes:

- Team at $699 (not $499): at $499 the product is priced like a monitoring tool, contradicting principle 1. The pilot de-risks the higher price point.
- No freemium. The free tier is a one-time artifact, not an ongoing service — free monitoring users create COGS without sales conversations.

---

## Business model assumptions (year 1, conservative)

- ACV $7–15k; 30–75 paying customers — not thousands of free users.
- Gross margin 65–75% after crawling + inference (requires the cost disciplines in [tech-stack.md](tech-stack.md)).
- Founder-led sales; time-to-close under 30 days (Team) / 60 days (Business); CAC payback < 6 months.
- Expansion to $18–40k ACV via modules + entities + seats before any Enterprise-led motion.

---

## Metrics

### Validation (Phase 1)

- Qualified demo → paid pilot ≥ 30%; pilot → paid ≥ 40%.
- **"Would have missed this" rate** ≥ 1 insight per customer per month that they say they'd have missed.
- Time to first value < 24 hours from onboarding.

### Product quality

- Briefing sections marked useful > 50% by month 3.
- High-severity alerts marked noisy/wrong < 15%.
- Evidence coverage = 100% of material claims (source + timestamp).
- **Priority-attach rate** — % of high-severity signals mapped to ≥ 1 stated business priority, target segment, competitor, or positioning risk. This measures whether the context grounding is real.
- **Action rate** — % of weekly briefings that produce ≥ 1 tracked action or forwarded discussion (> 30%). Opens are vanity; actions are the renewal predictor.
- Ask repeat usage > 40% of customers weekly by month 3.

### Business

- Logo retention: month 3 > 70%; year 1 (post-maturity) > 85%.
- NRR > 110% (don't target 120% before the expansion motion is proven).
- Second-module adoption > 30% of customers after Phase 2 launches; multi-module retention materially better than single-module.

### Strategic (the moat gauges)

- Months of searchable evidence history per customer.
- Entities with useful longitudinal history per customer.
- Distinct teams consuming briefings (target 2+ before pushing Phase-3 workflows).
- Customers citing historical memory/context as a reason they can't easily leave.
