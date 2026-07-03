# 11 — Battlecard Engine (Phase 1)

Per-competitor battlecards, generated at onboarding and **kept current by the signal stream** — the artifact sales actually opens before a competitive call. Battlecards are how AyeAstra lands inside the sales workflow (moat #3) and one of the "artifacts" requirements of the replacement bar.

## The bar

Klue's battlecards are strong but analyst-maintained — they go stale between updates. Static templates (Notion docs) go stale immediately. SOTA is **event-driven freshness with edit safety**: the pricing table updates itself when the pricing page changes, the "recent moves" section feeds from live signals, and a human edit is never overwritten by a machine — staleness is flagged, not clobbered.

## Card model (`battlecards.sections jsonb`)

| Section | Source | Provenance default |
|---|---|---|
| Snapshot (who/what/size/funding) | entity profile + filings/news | auto |
| Positioning vs. us | competitor profile × org's `BusinessContext.positioning` | auto |
| Pricing table | latest `PricingSnapshot` from diff engine — rendered from structured data, not prose | auto (always) |
| Strengths / weaknesses | baseline synthesis + context (`ourAdvantage`/`theirAdvantage`) | auto |
| Objection handling | context talk tracks × competitor claims | auto, expected to be edited |
| Recent moves (90d) | signal stream, top-N by severity | auto (always) |
| Win themes / landmines | synthesis | auto, expected to be edited |

Per-section: `content`, `provenance: auto|edited`, `updatedAt`. Card-level `changelog` records every mutation (what changed, triggered by which signal/user) — the briefing's "battlecard updates" section reads this.

## Lifecycle

- **Generate** at plan activation, per primary/secondary competitor, from the baseline crawl + context (`heavy` tasks per section, FactSheet-cited like everything else).
- **Refresh** (`battlecard.refresh`): scoring pipeline tags battlecard-relevant signals (pricing, launch, messaging, funding categories) → job regenerates *only the affected auto sections*, appends changelog, folds a mention into the next digest/briefing. Pricing table and recent-moves update on every relevant signal regardless.
- **Edit safety:** `edited` sections are never auto-rewritten. When new intelligence contradicts an edited section, the section gets a staleness banner ("pricing changed since this was edited — view what changed") linking the evidence. Human judgment wins; the machine annotates.
- **Export:** clean markdown + print-CSS PDF; share link (same token pattern as evidence). Exportability is a replacement-bar requirement — cards must live where sales lives.

## Build checklist

1. Section schema + provenance + changelog persistence.
2. Generation tasks per section + card assembly at activation.
3. Relevance tagging in `signal.route` → `battlecard.refresh` (affected-sections-only regeneration).
4. Edit UI (tiptap is already a dependency) + provenance flip + staleness banners.
5. Export (markdown/PDF) + share links.

## Acceptance

- Activation on the seed org yields complete cards for all primary competitors, pricing tables matching `extracted_facts` exactly.
- A seeded pricing change updates the pricing table + recent moves within one pipeline run and writes a changelog entry; an `edited` objection section stays untouched but shows the staleness banner.
- Exported PDF/markdown is presentable without cleanup (the demo test: would we send this to a prospect?).
