# 07 — Scoring & Grounding Engine (Phase 1)

Turns an org-agnostic `change` into an org-specific assessment: how severe, how relevant to *this* business, attached to which priorities. This is fusion mechanism #4 (business grounding) and the engine behind the PRD's **priority-attach rate** metric — the measure of whether context grounding is real, not marketing.

## The bar

Incumbents rank by keyword rules and source type — everyone watching Stripe sees the same "importance." Assistants have no notion of the reader's strategy at all. SOTA is **per-customer relevance**: the same pricing cut is CRITICAL for the premium-positioned competitor and NOTABLE for a bystander — determined by explainable, auditable scoring, with a feedback loop that tunes it per org. Explainability is non-negotiable: a score the user can't interrogate is a score they won't trust.

## Scoring model — LLM sub-scores, deterministic combination

The LLM judges; code decides. Sub-scores are produced by models against rubrics; the final severity is a **deterministic function in code** — inspectable, testable, tunable without re-prompting.

### Inputs per (change, org)

| Sub-score | Source | Range |
|---|---|---|
| `materiality` | diff engine's classification + kind weight (pricing > changelog > careers > docs) | 0–100 mapped |
| `entityWeight` | org's tier for the entity (primary 1.0 / secondary 0.6 / watch 0.3) × importance | 0–1 |
| `grounding` | `ground-signal` task (below) | 0–100 |
| `novelty` | embedding distance to org's recent signals (dedup index) | 0–1 |
| `feedbackAdjust` | per-org learned multiplier (below) | 0.5–1.5 |

### `ground-signal` (`medium` task — the heart of the product)

Input: FactSheet (extracted facts + diff summary) + current `BusinessContext`.
Output (Zod):

```ts
{ relevance: 0-100,
  attachedPriorities: [{ priorityId, how }],      // empty = honest "context-neutral"
  attachedSegments:   [{ segment, how }],
  positioningImpact:  { affected: bool, talkTrackAtRisk?: string, how? },
  whyItMatters: string,          // cites F-refs
  recommendedAction: string,     // concrete, owned ("update PayBridge battlecard")
  confidence: high|moderate|low,
  confidenceNotes: string        // "what would change this assessment"
}
```

`attachedPriorities` rows become the signal's `priority_attachments` — the priority-attach metric is `count(signals with ≥1 attachment) / count(high-severity signals)`, straight SQL.

### Final severity (code)

```
score = materiality × entityWeight × (0.5 + grounding/200) × noveltyFactor × feedbackAdjust
```

Mapped by thresholds → CRITICAL / HIGH / NOTABLE / INFO, with two hard rules on top:
- **CRITICAL requires** primary-tier entity AND (pricing/packaging change ∨ launch ∨ M&A/funding ∨ direct positioning attack) AND ≥ 1 priority or positioning attachment. CRITICAL is rare by construction — it's the alert users must never learn to ignore.
- **Confidence caps severity:** `low` confidence can't exceed NOTABLE. Uncertain claims never page anyone.

`scores jsonb` on the signal stores every sub-score — the UI can always answer "why did this rate HIGH?"

## Dedup & novelty

Before grounding runs: `dedup_key` (entityId + category + fact fingerprint) exact-match kills re-detections; embedding similarity ≥ 0.92 against the org's last 30 days → treated as follow-up (linked, not re-alerted). Novelty factor discounts near-repeats that survive.

## Feedback loop v1 (heuristic, transparent — no ML at launch)

Feedback verdicts (`useful | not_useful | wrong | already_knew`) adjust per-org weights at (entity × category) granularity:

- `not_useful` / `already_knew`: multiplier ×0.9 per event, floor 0.5. Three in a row on one cell → surface a one-tap mute offer ("stop alerting on PayBridge careers changes?").
- `useful`: ×1.05, ceiling 1.5.
- `wrong`: **never silently down-weights** — it files a review-queue item (ai-platform evals) because "wrong" means a pipeline defect (bad extraction, bad grounding), not a preference.
- All adjustments visible in Settings ("AyeAstra has learned…") and resettable. Silent learning erodes trust; visible learning builds it.

Targets this loop must hit (PRD): high-severity marked noisy/wrong < 15%; briefing sections useful > 50% by month 3.

## Insights v1 (multi-signal fusion — deliberately conservative)

Launch scope: **rule-triggered, model-verified, low volume.**
- Rule groupers over a 30-day window per entity: (pricing change + hiring spike), (launch + messaging shift), (funding + hiring spike), (≥3 HIGH signals same entity).
- Trigger fires → `heavy` task judges whether a real pattern exists, with FactSheet of the constituent signals; output requires `confidence` + `forward_look` + "what would change this." Model says no → no insight, log for tuning.
- Better zero insights than one stretched correlation — hallucinated strategic claims are risk #3 and insights are where they'd happen.

## Pipeline wiring

`change.analyze` (per material change) fans out `signal.ground` per watching org → dedup gate → `ground-signal` → severity code → persist signal (+ `embed.upsert`) → `signal.route` (alerts doc). Insight groupers run on signal insert.

## Build checklist

1. Severity/scoring function + thresholds + hard rules (pure function, unit-tested exhaustively).
2. Dedup: `dedup_key` fingerprinting + embedding-similarity gate.
3. `ground-signal` task + eval dataset (15+ hand-labeled change/context pairs with expected attachments & severity).
4. Feedback ingestion → weight table → multiplier application + Settings visibility + mute offers.
5. `wrong`-verdict review queue wiring into ai-platform evals.
6. Insight rule groupers + verifier task.

## Acceptance

- Same change, two orgs, different contexts → demonstrably different severity and why-it-matters (the fusion demo, as an automated test).
- Every HIGH/CRITICAL signal carries ≥ 1 priority/segment/positioning attachment or is explicitly `context-neutral` (and thus capped at NOTABLE — enforced in code).
- A signal's score decomposition renders fully from `scores jsonb` — no black boxes.
- Replayed feedback sequences move multipliers exactly as specified; `wrong` never changes weights but always files a review item.
