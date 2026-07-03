# Phase 2.2 — Outcome Tracking

Activates the dormant `outcomes` primitive: actions → owners → results → scoring feedback. This is what converts AyeAstra from "interesting" to "essential" (PRD risk #2) — renewal conversations get receipts ("12 actions taken, 3 deals cited the battlecard"), and outcome data becomes the ground truth that tunes scoring (moat #4).

## The bar

No CI tool closes the loop today — Klue tracks card *views*; nobody tracks whether intelligence changed a decision. Opens are vanity; actions are the renewal predictor (PRD metric). SOTA is a **zero-ceremony loop**: creating an action is one click where the recommendation already is, closing it is one click in the channel the owner already uses, and outcome evidence accrues into a quarterly ROI story without anyone filling in a form.

## Loop design (friction ruthlessly minimized)

1. **Create** — one click on any recommendation (briefing, alert, signal page) → `actions` row pre-filled from `recommended_action`; assign via Slack-native picker or email mention. Manual creation possible but never required.
2. **Nudge** — open actions ride existing artifacts (a compact "open actions" line in digest/briefing). No new notification stream, no PM-tool ambitions: statuses are `open | done | dropped`, nothing more. Deep work belongs in the customer's PM tool (optional webhook/export, not sync).
3. **Close** — one click/button ("done" / "dropped"), with an optional one-line "what happened?" → `outcomes` row (kpi free-text at this phase, e.g. "won deal vs PayBridge", linked evidence optional).
4. **Report** — quarterly value recap (auto-section in a briefing + exportable): actions taken by team, outcomes cited, "would have missed" moments logged from feedback. This artifact is for the renewal meeting.

## Feedback into scoring

- Action-taken on a signal ≈ strongest possible `useful` (weight above the feedback verdicts; same multiplier machinery, scoring doc).
- Signal categories whose recommendations are repeatedly dropped/ignored get selection-budget pressure in briefings (fewer slots) before severity dampening — fix the artifact before muting the intelligence.
- `outcomes` rows begin accumulating the dataset Phase-3 pattern validation needs (which signal families actually preceded wins/losses).

## Metrics wired (PRD)

Action rate (% of briefings producing ≥ 1 tracked action, target > 30%) · actions per org per month · outcome-attached actions % — all on the admin dashboard next to cost/margin.

## Build checklist

1. Action create affordances on recommendations (web + Slack button + email link).
2. Status transitions + Slack interactive close + "what happened" capture → `outcomes`.
3. Open-actions lines in digest/briefing; action panel on dashboard + entity pages.
4. Scoring hook (action-taken weight; budget pressure rule).
5. Quarterly value recap generator. 6. Metrics on admin dashboard.

## Acceptance

- Briefing recommendation → assigned action → Slack close → outcome row, all without opening a form.
- Action rate measurable per org on the dashboard; the quarterly recap renders a defensible renewal story on a seeded quarter.
- An org that takes actions demonstrably shifts its scoring weights (test via replay).
