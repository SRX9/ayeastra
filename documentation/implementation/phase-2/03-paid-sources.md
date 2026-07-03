# Phase 2.3 — Paid Data Sources (Tier 2)

Adds paid data — hiring intelligence (Coresignal / TheirStack), review intelligence (G2 partnership/API) — behind a provider interface, **per-source and only when revenue supports the economics and customers ask repeatedly** ([PRD Part 3](../../prd/03-product.md) source tiers). Tier-3 exclusions (LinkedIn scraping, ToS-hostile collection) remain absolute.

## The bar

Incumbents bundle third-party data opaquely and eat the margin. SOTA here is **unit-economics-gated enrichment**: each paid source clears a per-customer cost/value case before activation, plugs into the existing pipeline as just another fact producer (same evidence discipline — provider name + record ID + retrieval timestamp is the evidence), and is plan-gated so COGS lands on plans that carry it.

## Provider interface

```ts
interface DataProvider {
  key: "coresignal" | "theirstack" | "g2";
  capabilities: SourceKind[];                       // hiring_data | review_data
  fetch(entity: Entity, window: DateRange): Promise<ProviderRecord[]>;
  normalize(records): ExtractedFacts;               // → same shape the diff engine emits
}
```

Provider output enters the pipeline as `changes` rows (`source.kind: hiring_data | review_data`) with `extracted_facts` — grounding, scoring, briefings, Ask all work unchanged. Evidence records cite provider + record IDs + timestamps (no page snapshots to hash; the provenance chain is the API response, archived to R2).

## Source cases

- **Hiring (Coresignal vs TheirStack — evaluate on coverage of the martech vertical, API ergonomics, per-entity pricing):** replaces careers-page diffing with structured postings history + aggregates (headcount by function, growth rate, seniority mix). Unlocks the classic early-warning pattern (PRD fusion example: "hiring 60 days before market entry") with far better recall than page diffs. Careers-page monitors stay as the free fallback for entities below the paid threshold.
- **G2 reviews (official partnership/API only):** review velocity, rating trends, theme extraction (praise/complaint clusters per competitor), switching mentions. Feeds battlecard strengths/weaknesses with real voice-of-customer citations — big precision gain over the baseline "review themes from accessible sources."

## The economics gate (per source, hard)

Activate a provider only when: (incremental cost per entity per month × avg entities per org) < 15% of the plan-tier's monthly revenue for the orgs that would receive it, **and** ≥ 5 customers have asked for the capability by name (tracked in the pilot/CS log). Cost lands in `cost_events` (`vendor: coresignal|...`, org-attributed by entity watch), visible on the margin dashboard before and after rollout. Plan-gating: Business+ by default; Team as a priced add-on subscription item (billing §7 anticipated this).

## Build checklist

1. `DataProvider` interface + pipeline entry (provider records → `changes`).
2. Vendor evaluation spike (2 weeks, both hiring vendors on 20 real entities: coverage, freshness, cost).
3. First provider integration + rubrics/eval additions for its signal categories.
4. Plan-gating + cost attribution + margin-dashboard verification.
5. G2 partnership pursuit in parallel (business dependency, not engineering).

## Acceptance

- Provider data flows to briefing/battlecard/Ask with full provenance and zero pipeline special-casing beyond the adapter.
- Margin dashboard shows per-org COGS delta from the provider; the gate math is documented per activated source.
- Disabling a provider (contract lapse) degrades cleanly to free-tier coverage with coverage-page honesty updated automatically.
