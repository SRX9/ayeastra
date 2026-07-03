# 06 — Business Context Engine (Phase 1)

Captures who the customer is — strategy, positioning, competitors, segments, priorities — through the 10-minute AI onboarding interview, produces the reviewable Intelligence Plan, and keeps context fresh **without asking the customer to maintain anything** ([PRD Part 1](../../prd/01-vision.md) design rule: if a design requires scheduled data upkeep from the customer, the design is wrong). This context is moat #2 and the input that turns changes into intelligence.

## The bar

Incumbents capture context through weeks of CS-led setup calls that go stale; assistants have no durable context at all. SOTA is: **structured context from a conversational interview in minutes, enriched live by the product's own collection engine mid-interview** (the first "huh" moment: "did you know PayBridge launched X last week?"), versioned so every downstream assessment is auditable, and kept fresh as a side effect of normal product use.

## BusinessContext schema (the `payload` of `business_context`, Zod-defined in `packages/core`)

```ts
{
  company:     { name, domain, oneLiner, stage, market },
  positioning: { statement, differentiators[], pricingPosture: "premium"|"value"|"parity",
                 talkTracks[] },
  segments:    [{ name, description, priority: 1|2|3 }],
  competitors: [{ entityId, tier: "primary"|"secondary"|"watch",
                  ourAdvantage, theirAdvantage, notes }],
  priorities:  [{ id, text, rank, addedAt, status: "active"|"done"|"dropped" }],
  concerns:    [{ text, addedAt }],
  delivery:    { briefingDay, timezone, channels: {email[], slackWebhook?},
                 alertRouting: {critical, high, notable} }
}
```

Append-only versions; `currentContext(orgId)` = latest. Signals and briefings stamp `context_version` (data-model doc) — "why was this scored HIGH in March?" is always answerable against the context that scored it.

## The interview (5 stages, ~10 minutes)

Server-driven state machine; each stage = a chat exchange with a stage-specific system prompt + a `small`-tier extraction task filling its context slice. Streaming UI (chat surface in the web app). User can skip any stage; the manual Settings form is the same schema, so nothing depends on the interview itself.

| Stage | Captures | Background enrichment (fired immediately, results streamed into the chat) |
|---|---|---|
| 1. Company & market | company, market, stage | Crawl customer domain → prefill positioning guesses for stage 3 confirmation |
| 2. Competitors | competitor names → entity resolution | Per competitor: `source.discover` + quick profile task → surface a "did you know" card (recent launch, pricing posture) — the first wow |
| 3. Positioning | statement, differentiators, pricing posture | Contrast prefilled self-description vs. competitor profiles → sharper follow-up questions |
| 4. Priorities & concerns | ranked priorities, current concerns | — |
| 5. Delivery | briefing day/TZ, channels, routing | Slack connect (optional), email confirm |

Interview mechanics: one extraction task per user turn (`extract-context-slice`), so a rambling answer to stage 2 that mentions a priority still lands in the right slice. Entity resolution against global `entities` (alias match → create if new, which triggers discovery).

## The Intelligence Plan (review → Activate)

Generated from context when the interview completes — the contract of what AyeAstra will do:

- Entities to watch (with tiers) · sources per entity (from discovery, with cadence bounds) · alert routing matrix · briefing schedule · what is **not** covered (Tier-2/3 honesty, e.g. "review sites and social are not monitored at launch").
- Rendered as an editable review screen (add/remove competitors, toggle sources, adjust routing). **Activate** = write `org_entities`, enable monitors, schedule `briefing.baseline`, start the clock on time-to-first-value (< 24h to Baseline Dossier).

## Freshness without upkeep (PRD risk #6)

No scheduled homework. Context stays current through four passive/one-tap loops:

1. **Feedback as context signal.** `already_knew`/`not_useful` streaks on a competitor or category → scoring dampens it (scoring doc) and, past a threshold, the next briefing asks one targeted question ("Still tracking PayBridge as primary?").
2. **Briefing context check.** One compact section, at most monthly, max 3 one-tap confirmations ("Q3 priority still 'win mid-market'? ✓ / edit"). Never a form, never required.
3. **Explicit edits.** Priorities/competitors/positioning editable in Settings in seconds; every edit = new context version, effective immediately for scoring.
4. **Staleness heuristic.** Priorities untouched 60d + declining usefulness rate → flag internally + gentle in-product prompt. Confidence-sensitive assessments cite context age when it matters ("assessment assumes 'win mid-market' is still priority #1").

## Build checklist

1. `BusinessContext` Zod schema in `packages/core` + versioned persistence + `currentContext()`.
2. Interview state machine + `extract-context-slice` task + streaming chat UI (onboarding surface, web-app doc).
3. Enrichment jobs (`context.enrich`): domain crawl, competitor quick-profiles, "did you know" cards.
4. Entity resolution helper (alias match → create + discover).
5. Intelligence Plan generator + review screen + Activate transaction.
6. Manual settings forms (same schema) + context-version stamping.
7. Freshness loops: feedback thresholds, briefing context-check section contract (consumed by briefing engine), staleness flag.

## Acceptance

- A cold signup reaches an activated plan in ≤ 15 min with ≥ 1 enrichment "huh" surfaced mid-interview (test with a real martech company).
- Skipping the interview entirely and using manual forms produces an identical, fully functional context.
- Editing a priority creates a new version; the next scored signal carries the new `context_version` while old signals keep theirs.
- No flow anywhere asks the customer to "keep something updated" on a schedule — verified by walkthrough.
