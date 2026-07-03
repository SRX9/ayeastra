# 08 — Briefing Engine (Phase 1)

Generates the Monday Competitive Briefing — the flagship artifact and forwardable visibility layer ([PRD Part 2](../../prd/02-strategy.md)) — and the day-1 Baseline Dossier. Everything else in the product exists to make this artifact excellent; it is also where hallucination risk concentrates, so QA gating lives here.

## The bar

ChatGPT Deep Research produces a fluent weekly summary with links — that is the commodity floor, not the target. The commodity-gap test (generate the same week with Deep Research; whatever it does well is table stakes) defines what we must add: **before/after diffs, customer-specific implications, concrete owned recommendations, and memory** ("third pricing move this quarter — pattern"). A briefing that could have come from a free tool is a failed briefing. The second bar is trust mechanics: every material claim carries evidence; an empty week says so honestly instead of padding.

## Section contract (from PRD Part 2/3 — fixed at launch, feedback-instrumented per section)

1. **Executive summary** — 3–5 bullets, written *last* from finished sections.
2. **Top competitor moves** — ranked by severity × grounding.
3. **Pricing & packaging changes** — with before/after diff embeds (the signature visual).
4. **Launches & changelog highlights.**
5. **Messaging & positioning shifts** — vs. the customer's own positioning.
6. **Impact map** — signals × (stated priorities, target segments); the visible proof of grounding.
7. **Battlecard updates** — what changed in which card this week (links).
8. **Recommended actions** — each with a suggested owner role and a "create action" affordance.
9. **Context check** — at most monthly, ≤ 3 one-tap confirmations (context-engine contract).

Every section: source link + timestamp + confidence on every material claim; per-section feedback controls.

## Pipeline (`briefing.weekly`, per-org cron, Monday early-AM org TZ)

```
gather → select → synthesize (per section) → exec summary → QA gate → render → deliver
```

1. **Gather.** Signals + insights for the org in the period window; battlecard changelog; open actions; prior-briefing carryover (unresolved CRITICALs resurface once).
2. **Select.** Per-section budgets (e.g. top moves ≤ 5, pricing ≤ 4) by `severity × grounding`, dedup across sections (a signal leads in one section, is referenced elsewhere). Selection is code, not model — the model never chooses what matters; scoring already did.
3. **Synthesize.** One `heavy` task per section (`brief-section:{key}`), input = FactSheet built from the selected signals' facts + evidence IDs + relevant context slice + **entity memory** (prior signals for the same entities — this is where "third move this quarter" comes from). Output schema: section blocks with mandatory `refs`. Org context block is prompt-cache-stable across sections (cost).
4. **Exec summary** from the finished section outputs (never from raw signals — it summarizes the briefing, not the week).
5. **QA gate** (code, in order):
   - Schema + citation validation (every ref resolves — ai-platform validator).
   - **Numeric cross-check:** every number in section text must appear in the cited `extracted_facts` (regex extract → set compare). Catches the classic LLM crime of inventing "$399".
   - Confidence lint: any predictive claim ("likely", "expect") must carry a confidence marker.
   - Fail → regenerate that section once with errors appended → still failing → **drop the section, note it in an internal log, deliver the rest**. A shorter honest briefing beats a padded or delayed one; repeated drops page us via dead-letter review.
6. **Empty-week mode.** Below a signal threshold: short "quiet week" briefing — what was checked (coverage proof), minor notes, one landscape observation from the archive. Explicitly framed; never inflated. Quiet honesty is a retention feature, not a failure.
7. **Render** three targets from one section AST: web (React reader), email (react-email — full content, not a teaser), Slack (Block Kit digest: exec summary + top moves + link). Store rendered keys on the briefing row; archive is immutable once delivered.

## Baseline Dossier (`briefing.baseline`, on plan activation — the < 24h first-value moment)

Same engine, `kind: baseline`, different sections: landscape overview · per-competitor profile (positioning, pricing snapshot from first crawl, recent moves from blog/changelog history, hiring picture) · "what we're now watching" (coverage table — sets the expectation that diffs start next week). Honest cold start per PRD: impressive, explicitly framed as the baseline, no fake diffs. Also the engine for the free **Baseline Dossier lead magnet** (same pipeline, throwaway org context) — one engine, two GTM uses.

## Cost controls

- Section synthesis only over *selected* signals (budgeted FactSheets), never the whole week's raw haul.
- Prompt-cache-stable context block; sections share it.
- Typical weekly briefing budget target: < $1.50 inference per org per week at launch scale (telemetry-verified via `cost_events` tagged `briefing:*`).

## Build checklist

1. Section AST types + selection logic (budgets, cross-section dedup, carryover).
2. FactSheet builders (per section) + entity-memory retrieval.
3. `brief-section:*` tasks + exec-summary task (+ hand-written exemplar sections as eval fixtures — the quality yardstick).
4. QA gate: citation, numeric cross-check, confidence lint, regenerate-once, drop-and-log.
5. Renderers: web AST components, react-email template, Slack blocks.
6. `briefing.weekly` + `briefing.baseline` jobs; delivery handoff (alerts-delivery doc).
7. Empty-week mode.

## Acceptance

- Golden-path test: seeded week of real changes → briefing where every material claim's citation resolves to real evidence and every number matches `extracted_facts` (asserted mechanically).
- Kill one section's generation → briefing delivers without it; internal log records the drop; nothing padded.
- Quiet week produces the honest short form, not filler.
- Side-by-side against a ChatGPT Deep Research run on the same week (the commodity-gap test, repeated): the briefing contains diffs, priority attachments, owned recommendations, and memory references the free tool structurally cannot produce.
- Baseline Dossier lands < 24h after activation on a fresh org.
