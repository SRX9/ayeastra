# Phase 2.1 — Module Framework & Product/Market Watch

Makes "module" a real technical object so the second module is configuration + new agents, not a second product — then ships **Product & Market Watch** as its proof. Gated by Phase-1 exit criteria and the replacement bar ([PRD Part 2](../../prd/02-strategy.md)).

## The bar

Suite vendors bolt on modules that feel like separate products with separate setups. SOTA is **one platform, one entity graph, one context, N lenses**: buying a second module adds agents, signal categories, and briefing sections over the same entities and context the customer already configured — activation in minutes, and fusion (cross-module insights) becomes automatic at 2+ modules because everything already shares primitives.

## Module manifest (the contract)

```ts
type ModuleManifest = {
  key: "competitive_watch" | "product_market_watch" | ...,   // entitlement key (billing)
  signalCategories: SignalCategory[],       // owned categories
  sourceKinds: SourceKind[],                // additional kinds discovery should map
  analysisTasks: TaskRef[],                 // agents: analyze tasks for its categories
  briefingSections: SectionDef[],           // sections merged into the weekly briefing
  onboardingSlice?: ContextSliceDef,        // extra interview questions when activated
  artifacts?: ArtifactDef[],                // battlecard-analogs, if any
};
```

Platform changes to support it (small, deliberate):
- `signals.category` and briefing sections carry a `module_key`; routing/entitlement checks read it (billing: module = subscription item, already anticipated in [billing.md](../../billing.md) §7).
- **One briefing, module-merged sections** — never a second briefing per module. The Monday artifact stays singular; modules contribute sections. Selection budgets rebalance by org's active modules.
- Competitive Watch itself is retrofitted into manifest form first — the framework is proven on the existing module before the new one ships.

## Product & Market Watch (the second module — same buyer family)

What the PMM/product buyer tracks beyond named competitors: the **category**.

| Coverage | Sources (Tier-1 discipline still applies) | Signal categories |
|---|---|---|
| Funding & M&A in the category | press releases, filings, funding news feeds | `funding`, `ma` |
| Category entrants & adjacent launches | news, ProductHunt/launch feeds, category keyword news queries | `market_entry`, `category_launch` |
| Ecosystem/platform shifts | platform changelogs & policy pages (e.g. Salesforce/HubSpot ecosystems) | `platform_shift` |
| Category narrative | analyst/press coverage themes | `narrative_shift` |

New capability: **category watches** — `org_entities` gains market-type entities ("CDP market") whose sources are keyword-query feeds rather than site maps; discovery extends accordingly. Grounding works unchanged: category signals score against the same priorities/segments/positioning.

Briefing sections added: *Market moves* (funding/M&A/entrants) · *Category narrative* — merged into the existing weekly.

## Replacement-bar gate (hard, per PRD — verified before pricing-page listing)

Coverage of the buyer's manual category-tracking sources · precision (high-priority findings usually useful) · evidence on every claim · delivered in existing channels · artifacts used immediately · replaces 60–80% of their manual market-tracking. Run 5+ design-partner orgs on it free/beta until metrics clear; one mediocre module poisons the platform.

## Build checklist

1. Manifest type + module registry; retrofit Competitive Watch.
2. Entitlement wiring (billing add-on item → org's active modules → routing/section gates).
3. Market-entity type + keyword-feed sources in discovery/collection.
4. New analysis tasks + rubrics + eval datasets (same discipline as Phase 1).
5. Briefing section defs + budget rebalance.
6. Beta on design partners → replacement-bar metrics → pricing-page listing.

## Acceptance

- Activating the module on an existing org takes < 10 min (its onboarding slice only) and the next Monday briefing includes market sections grounded in existing context.
- Deactivating cleanly gates its sections/alerts without touching Competitive Watch.
- Replacement-bar metrics measured and cleared on ≥ 5 orgs before public listing; PRD Phase-2 targets in view (30%+ second-module adoption, multi-module retention materially better).
