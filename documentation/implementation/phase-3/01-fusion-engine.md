# Phase 3.1 — Fusion Engine (Cross-Module Insights & Patterns)

The full fusion layer: cross-module correlation, temporal pattern detection, and the validated pattern library (moat #6). Gated hard: requires 2+ live modules, months of archive depth, and Phase-2 exit criteria. Everything here rides on decisions already banked — shared entity graph, org-agnostic `changes`, versioned context, outcome data.

## The bar

Nobody in the category does real cross-domain fusion (PRD differentiation table: "Cross-domain fusion over time — No / No / Architecture supports it"). The bar is set by intelligence tradecraft, not competitors: **calibrated, backtested inference** — a pattern earns the right to make a forward-looking claim only after it has demonstrated precision on the archive. One stretched correlation in a briefing costs more trust than fifty insights earn (risk #3 at its sharpest).

## Three layers

### 1. Cross-module correlation (extends scoring-engine Insights v1)
Rule groupers widen to cross-module windows per entity: competitive signals × market signals × (Phase-2 paid) hiring/review data — e.g. *funding round (market) + exec hiring spike (hiring) + pricing repackage (competitive) → expansion-move hypothesis*. Same conservative contract as v1: rule triggers → `heavy` verifier with full FactSheet → confidence + forward_look + "what would change this" — or nothing.

### 2. Temporal patterns (per-entity behavior baselines)
Per entity, from the archive: release cadence, pricing-change frequency, hiring rhythm, messaging-shift tempo. Deviation detection (acceleration/inflection, fusion mechanism #2) generates `pattern_candidate` events — "PayBridge ships quarterly; three releases in 6 weeks is a 3σ acceleration." Baselines are statistics in code (EWMA/stddev over signal streams), not model vibes; the model only narrates verified deviations.

### 3. Pattern library (the codified moat)

```
patterns: id, scope (entity|industry|global), trigger_spec jsonb (signal categories,
          window, thresholds), claim text ("X precedes market entry by ~60d"),
          validation jsonb {backtests, precision, n}, status (candidate|validated|retired)
```

Lifecycle: candidate (from analyst hypothesis or repeated correlation hits) → **backtest against the archive** (replay historical `changes`/`signals`: how often did the trigger fire, and how often did the claimed outcome follow?) → validated only at precision ≥ 0.7 with n ≥ 5 → user-visible early warnings citing the pattern's own track record ("this pattern has preceded 4 of 5 launches we've observed"). Retire on decay. The archive depth (moat #1) is what makes backtesting possible at all — this is where it pays compound interest.

## Delivery

Fusion insights are rare, prominent artifacts: dedicated briefing block ("Connected intelligence"), CRITICAL-style alert only when a validated pattern fires against a primary competitor + attached priority. Volume target: quality over quantity — single-digit fusion insights per org per month is success, not failure.

## Build checklist

1. Cross-module groupers + verifier extension.
2. Baseline statistics per entity stream + deviation events.
3. `patterns` table + backtest harness (replay over archive) + validation lifecycle.
4. Briefing/alert integration + pattern track-record rendering.
5. Outcome-data join (Phase 2.2) for pattern-claim validation where customers logged results.

## Acceptance

- Backtest harness reproduces documented historical sequences from the archive (seeded with known cases from operating history).
- No forward-looking claim reaches a user from a `candidate` pattern — gate enforced in code.
- Fusion insights in production briefings maintain > 70% useful-feedback rate (higher bar than regular sections — prominence demands it).
