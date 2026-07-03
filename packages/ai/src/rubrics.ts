/**
 * Shared rubric text (ai-platform doc): one vocabulary, defined once,
 * mirroring the pg enums in @ayeastra/db. Every task that outputs
 * severity/confidence/materiality imports from here.
 */

export const SEVERITY_RUBRIC = `Severity levels:
- critical: direct, immediate threat to a stated priority or revenue segment (e.g. primary competitor undercuts your core plan, targets your key segment).
- high: material competitive move that demands a response decision this week (pricing/packaging change, launch into your space, positioning shift at your segment).
- notable: relevant development worth awareness, no immediate action (adjacent launch, meaningful hiring pattern, roadmap hint).
- info: context only (minor content updates, routine posts).
Severity must be justified by cited facts; when confidence is low, cap severity at notable.`;

export const CONFIDENCE_RUBRIC = `Confidence levels:
- high: directly stated on a primary source (their own pricing page, changelog, filing).
- moderate: strong inference from a primary source, or a reputable secondary source.
- low: indirect inference, single weak source, or ambiguous evidence.
Always state what new evidence would change the assessment.`;

/**
 * Per-source-kind materiality rubrics (diff-engine doc, stage 2).
 * Numeric/table changes on pricing pages are force-promoted to material by
 * code BEFORE the model runs — the rubric restates it for the model's sake.
 */
export const MATERIALITY_RUBRICS: Record<string, string> = {
  pricing:
    "Any change to a number, plan name, feature-gate, or CTA is material. Layout/style changes with identical plans, prices, and features are cosmetic.",
  changelog:
    "New entries are material (the content IS the change). Edits to old entries are content.",
  blog: "New posts are material. Edits to old posts are content.",
  news: "New items are material. Edits to old items are content.",
  careers:
    "Listings added/removed are content by default; material when volume or seniority spikes (>=3 new roles in one function, or a VP+ role).",
  docs: "Copy tweaks are cosmetic; new sections, products, or integrations are material.",
  homepage:
    "Copy tweaks are cosmetic; new sections, products, integrations, or messaging/positioning shifts are material.",
  filings: "Any new filing or amendment is material.",
  app_store:
    "Version releases with feature notes are material; metadata-only tweaks are cosmetic.",
  keyword_feed:
    "New items about funding, M&A, product launches, market entries, or platform policy changes in the watched category are material. Opinion pieces and listicles are content; duplicates of already-seen stories are cosmetic.",
  hiring_data:
    "Structured postings deltas: material when volume or seniority spikes (>=3 new roles in one function, or a VP+ role) or a new function appears; otherwise content.",
  review_data:
    "Rating-trend inflections, review-velocity spikes, and new complaint/praise themes are material; individual routine reviews are content.",
};

export const ANALYST_TONE =
  "Write as a competitive-intelligence analyst, not a marketer: precise, hedged with confidence levels, no hype. Cite only provided F-refs; omit any claim you cannot cite.";
