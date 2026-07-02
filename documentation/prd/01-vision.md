# 01 — Vision

*Part of the [AyeAstra PRD](README.md). What we're building, the problem, and the core architecture idea.*

---

## One sentence

AyeAstra is an AI market intelligence analyst for business: it continuously watches the outside world, grounds what it finds in the company's own strategy and priorities, and tells each team what changed, why it matters, and what to do next — with evidence for every claim.

**Naming and language rules:**

- **The product name is AyeAstra** (decided). Remaining diligence before public launch: trademark registration, domain, and social handles. Note the search adjacency to Google's "Project Astra" assistant brand — owning the exact-match term "AyeAstra" early (consistent spelling everywhere) matters.
- In all external copy we say **market intelligence** or **external intelligence** — never "business intelligence" (BI). BI already means internal-data dashboards (Tableau, Power BI) and would mis-position the product in the first sentence.
- "Palantir for business" and "Jarvis for business" are **internal north stars only**. They never appear in marketing. Externally we lead with concrete outcomes.

---

## The problem

Every company is surrounded by information that affects it — competitor moves, market shifts, customer sentiment, regulation, vendor risk — but that information lives in 20+ public and semi-public places and in nobody's job description. Companies cope in two bad ways:

1. **Fragmented point tools**: Klue/Crayon for competitive ($15–50k/yr), Brandwatch for brand ($10–30k/yr), Recorded Future for security ($50k+/yr), Thomson Reuters for regulatory, ZoomInfo for accounts, PitchBook for M&A. A typical mid-market company spends $50–200k/yr across tools that don't talk to each other and know nothing about the customer's actual business.
2. **Manual labor**: analysts and PMMs spend ~70% of their time collecting information and ~30% analyzing it.

Either way, the connections between signals — where the real intelligence lives — are made by humans, manually, inconsistently, and late. "This competitor price cut + our premium positioning + our current segment focus = update the talk track this week" goes undetected because the pieces sit in different places.

**The gap in one line:** a monitoring tool reports that a competitor's pricing page changed; an analyst tells you what that change means for your positioning, roadmap, campaigns, and sales narrative. Companies need the analyst. They only have monitoring tools.

---

## The two-context architecture

The current product is deliberately connector-free. AyeAstra does not need access to customer systems to create value in the first version. It fuses two contexts:

| Context | What it is | How it's acquired |
|---|---|---|
| **External context** | The outside world: competitors, markets, customers, regulators, vendors | Continuous monitoring of durable public sources by the agent swarm |
| **Business context** | Who this business is: strategy, positioning, competitors, target segments, priorities, roadmap themes, current concerns | A 10-minute AI onboarding interview, reviewable setup artifacts, and lightweight feedback on briefings and alerts |

### Design rule: no required integrations

The launch product must work without connecting to a customer's internal tools. Required operational integrations slow setup, create security review friction, and make the first product harder to sell than it needs to be.

We still avoid asking customers to maintain an "internal information library" by hand. Manually-fed knowledge bases go stale within weeks, and stale context produces wrong intelligence — which destroys trust permanently. The first version captures slow-changing business context during onboarding, then keeps it fresh through feedback, explicit priority edits, and recurring briefing review. **If a design requires scheduled data upkeep from the customer, the design is wrong.**

---

## The fusion thesis

A single signal is data. Signals joined continuously and grounded in this business's context become intelligence:

> **Data:** "Competitor PayBridge cut Pro pricing from $499 to $399 yesterday."
>
> **Intelligence:** "PayBridge cut Pro pricing 20% yesterday (evidence: page diff, timestamped). This directly pressures your premium-positioned mid-market package and weakens the current 'lower total cost than PayBridge' talk track. Recommended: update the PayBridge battlecard, brief sales on the new objection, and decide whether the next campaign should emphasize implementation speed over price."

Fusion has five mechanisms, layered in over time:

1. **Entity resolution** — "Stripe," "@stripe," and "Stripe, Inc." map to one canonical entity.
2. **Temporal linking** — track how signals about an entity evolve; detect acceleration and inflection points.
3. **Context correlation** — join external signals with the customer's stated strategy, positioning, target segments, priorities, and known competitors.
4. **Business grounding** — score every signal against *this* company's market, strategy, current priorities, and decision cadence.
5. **Pattern learning** — codify recurring patterns ("this competitor posts hiring 60 days before market entry") for early warnings.

### Every output answers five questions

1. **What happened?** (with source evidence — link, timestamp, before/after)
2. **Why does it matter to *this* business specifically?**
3. **What's likely next?**
4. **What should we do, and who should do it?**
5. **How confident are we, and what would change the assessment?**

This is the intelligence-briefing format agencies have used for decades, adapted for business. Evidence on every material claim is non-negotiable — it is the trust foundation the whole product stands on.

---

## What AyeAstra is not

- Not a dashboard or an alert feed — feeds get ignored; analysts get consulted.
- Not a chatbot — Ask AyeAstra exists, but the product works proactively.
- Not a manually-maintained knowledge base (see design rule above).
- Not "BI" — we don't chart your internal data; we watch the world outside.
- Not an integration project — the first product must activate from onboarding context and public sources.
- Not a bundle of mediocre monitors — a module ships only when it beats the specialist workflow it replaces (see the replacement bar in [Part 2](02-strategy.md)).

---

## North star

AyeAstra becomes the place a company opens — and the briefing a company trusts — when it needs to know:

> *"What changed, why it matters to us, what to do next, and who should do it."*

The long-term destination is the all-department intelligence layer: every team served, external change fused with company memory, institutional knowledge that survives turnover. That destination is **earned through a sequence of narrow wins, not declared at launch** — the sequencing is the strategy, and it lives in [Part 2](02-strategy.md).
