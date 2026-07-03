# 05 — Diff & Evidence Engine (Phase 1)

Turns consecutive snapshots into `changes` with extracted facts, and mints the immutable `evidence` records behind every claim in the product. This is **the signature surface** ([PRD Part 3](../../prd/03-product.md)) and moat #1: timestamped before/after history nobody else has. ChatGPT has no memory of what a pricing page looked like in March; we do, forever.

## The bar

Diff tools show raw HTML noise; incumbents store screenshots without structure. SOTA is a **three-stage funnel** — cheap hashing kills the 95% of checks where nothing changed, structural diffing isolates *what* changed, and kind-aware extraction turns it into precise facts ("Pro: $499 → $399") — plus **court-grade evidence**: content-hashed, immutable, permanently linkable, rendered as a human-readable before/after. Demos, screenshots, and trust are built on this rendering.

## Pipeline (`change.detect`, runs after every fetch)

### Stage 0 — Hash gate (free)
Normalize the Firecrawl markdown: strip volatile tokens (dates rendered "today", counters, session IDs, cookie-banner remnants) with per-kind regex heuristics → `content_hash` (SHA-256). Hash equal to previous snapshot → done, no change, adaptive interval decays. This ends ~95% of checks at zero LLM cost.

### Stage 1 — Block diff (cheap, deterministic)
Split both markdown versions into stable blocks (headings, paragraphs, table rows, list items). Patience-diff over block hashes → added / removed / modified block sets. Persist a rendered side-by-side HTML diff to R2 (`diff_r2_key`) — this exact artifact is what users screenshot and forward.

### Stage 2 — Materiality classification (`small` task)
`classify-change`: changed blocks + source kind → `{materiality: cosmetic|content|material, category, summary}` using per-kind rubrics from `packages/ai/rubrics.ts`:
- **pricing:** any change to a number, plan name, feature-gate, or CTA = `material`. Never let a model round this down — numeric/table changes are force-promoted by code before the model runs.
- **changelog/blog/news feed:** new entries = `material` (content is the change); edits to old entries = `content`.
- **careers:** listings added/removed = `content` by default, `material` when volume or seniority spikes (≥3 new roles in one function, or VP+ role).
- **docs/homepage:** copy tweaks = `cosmetic`; new sections/products/integrations = `material`.

`cosmetic` changes are recorded (archive completeness) but never analyzed further.

### Stage 3 — Kind-aware fact extraction (`small` task per kind)
Material changes get structured extraction into `extracted_facts`:

| Kind | Extractor output |
|---|---|
| pricing | `PricingSnapshot { plans: [{name, price, period, features[], limits}] }` — extracted from *both* snapshots, then structurally compared in code → exact deltas (`Pro.price: 499→399`) |
| changelog / blog / news | `{ entries: [{title, date, summary, url}] }` — new entries only |
| careers | `{ added: [{title, function, seniority, location}], removed: [...], countsByFunction }` |
| filings | `{ formType, filedAt, headlineItems[] }` |
| generic | `{ changedClaims: [{before, after, topic}] }` |

Structural comparison happens **in code**, not in the model — the model extracts, the code diffs. Numbers in downstream copy always come from `extracted_facts`, never from model prose (the briefing QA gate cross-checks this).

Finally: embed the change summary (`embed.upsert`), write the `changes` row, fan out `change.analyze` for each org watching the entity — this fan-out crosses the platform seam (CF → Trigger.dev REST, jobs doc) with idempotency key `analyze:{changeId}`.

## Evidence records

Minted whenever a change (or baseline crawl) will be cited:

```
evidence: source_url, fetched_at, content_hash, r2_keys {before_html, after_html,
          before_md, after_md, diff_html, screenshots[]}, extracted jsonb
```

- **Immutable and permanent.** Never updated, never deleted. Customer-visible history is plan-gated (12 mo on Team); the archive itself is kept forever — it is the compounding moat.
- **Verifiable.** `content_hash` computed over stored content; the UI shows hash + fetch timestamp on every evidence view ("hash-verified" is a demo line).
- **Shareable.** `share_token` (unguessable, revocable) → public read-only route `/evidence/[id]?t=…` rendering the before/after with source, timestamp, and AyeAstra attribution. Forwardability is a growth feature: every shared diff is a product demo.

## Failure modes & guards

- **False-positive diffs** (rotating testimonials, A/B tests, geo pricing): volatile-token stripping first; per-source block-ignore list (ops-editable) for repeat offenders; A/B flapping detector — if a block alternates between two known states, auto-ignore and log.
- **Extraction errors on exotic pricing pages:** extractor confidence below threshold → change persists as `material` with block diff only, `extracted_facts: null` — the signal engine then cites the diff, not invented numbers. Never guess structure.
- **Firecrawl markdown drift** (renderer update changes whitespace globally): normalization versioned; on normalizer/vendor change, re-hash last snapshot per source before comparing — never diff across normalizer versions.

## Build checklist

1. Normalizer (per-kind volatile-token rules, versioned) + hash gate.
2. Block splitter + patience diff + side-by-side HTML renderer → R2.
3. `classify-change` task + rubrics + numeric force-promotion (eval dataset: 40 labeled real diffs).
4. Extractors: pricing first (eval: 20 real pricing pages), then changelog/careers/generic.
5. Evidence minting + share tokens + public route.
6. `change.detect` job wiring: fetch → stages → fan-out.

## Acceptance

- Replay a recorded month of snapshots from 3 real competitors: zero missed pricing changes, < 5% false-positive material changes.
- Pricing extraction eval ≥ 95% field-accurate on the golden set; a failed extraction degrades to diff-only, never wrong numbers.
- Every material `changes` row has a rendered diff in R2 and at least one evidence record; share link renders without auth and survives revocation test.
- Hash gate terminates ≥ 90% of checks on the seeded quiet sources with zero model cost.
