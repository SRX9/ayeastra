import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Shared vocabulary (data-model doc §Layering rule). Every closed set the
 * PRD names is a pg enum — no magic strings downstream. Extend with
 * ALTER TYPE ... ADD VALUE (e.g. Phase 2 adds market_entry categories).
 */

// ── Global observation layer ────────────────────────────────────────────
export const entityType = pgEnum("entity_type", [
  "company",
  "product",
  "market",
  "person",
  "vendor",
]);

export const aliasSource = pgEnum("alias_source", [
  "user",
  "discovery",
  "resolution",
]);

export const entityRelation = pgEnum("entity_relation", [
  "product_of",
  "subsidiary_of",
  "competes_in",
]);

export const sourceKind = pgEnum("source_kind", [
  "pricing",
  "changelog",
  "blog",
  "docs",
  "careers",
  "news",
  "filings",
  "app_store",
  "homepage",
  // Phase 2.1 — category watches: keyword-query feeds for market entities.
  "keyword_feed",
  // Phase 2.3 — paid providers enter the pipeline as sources of these kinds.
  "hiring_data",
  "review_data",
]);

export const sourceDiscovery = pgEnum("source_discovery", ["auto", "user"]);

export const sourceStatus = pgEnum("source_status", [
  "ok",
  "degraded",
  "broken",
  "retired",
]);

export const materiality = pgEnum("materiality", [
  "cosmetic",
  "content",
  "material",
]);

export const signalCategory = pgEnum("signal_category", [
  "pricing",
  "packaging",
  "launch",
  "messaging",
  "hiring",
  "funding",
  "partnership",
  "regulatory",
  "other",
  // Phase 2.1 — Product & Market Watch categories (append-only: pg enums
  // extend with ALTER TYPE ... ADD VALUE, which db:push emits).
  "ma",
  "market_entry",
  "category_launch",
  "platform_shift",
  "narrative_shift",
  // Phase 2.3 — review intelligence.
  "reviews",
]);

/**
 * Phase 2.1 — module framework. Category → module ownership lives in
 * @ayeastra/modules; this enum is the entitlement/billing key.
 */
export const moduleKey = pgEnum("module_key", [
  "competitive_watch",
  "product_market_watch",
]);

export const moduleActivationSource = pgEnum("module_activation_source", [
  "billing",
  "manual",
]);

// ── Per-org intelligence layer ──────────────────────────────────────────
export const severity = pgEnum("severity", [
  "critical",
  "high",
  "notable",
  "info",
]);

export const confidence = pgEnum("confidence", ["high", "moderate", "low"]);

export const orgEntityRole = pgEnum("org_entity_role", [
  "competitor",
  "self",
  "market",
  "vendor",
]);

export const orgEntityTier = pgEnum("org_entity_tier", [
  "primary",
  "secondary",
  "watch",
]);

export const signalStatus = pgEnum("signal_status", [
  "new",
  "acknowledged",
  "dismissed",
  "snoozed",
]);

export const actionSourceType = pgEnum("action_source_type", [
  "signal",
  "insight",
  "briefing",
  // Phase 3.2 — actions created inside a Mission Room (sourceId = mission).
  "mission",
]);

export const actionStatus = pgEnum("action_status", [
  "open",
  "done",
  "dropped",
]);

export const briefingKind = pgEnum("briefing_kind", [
  "weekly",
  "baseline",
  "dossier",
  // Phase 3.2 — Board Mode: the quarterly executive artifact rides the same
  // append-only briefings table (sections AST, QA gate, renderers).
  "board",
]);

export const briefingStatus = pgEnum("briefing_status", [
  "generating",
  "qa_failed",
  "ready",
  "delivered",
]);

export const feedbackTargetType = pgEnum("feedback_target_type", [
  "signal",
  "briefing_section",
  "battlecard_section",
  "ask_answer",
  // Phase 3.1 — fusion insights carry their own feedback stream (the >70%
  // useful-rate acceptance metric is a query over these rows).
  "insight",
]);

export const feedbackVerdict = pgEnum("feedback_verdict", [
  "useful",
  "not_useful",
  "wrong",
  "already_knew",
]);

export const askRole = pgEnum("ask_role", ["user", "assistant"]);

export const deliveryChannel = pgEnum("delivery_channel", ["email", "slack"]);

export const deliveryTargetType = pgEnum("delivery_target_type", [
  "alert",
  "digest",
  "briefing",
  // Phase 3.1 — validated-pattern alerts target the insight row itself.
  "insight",
]);

export const deliveryStatus = pgEnum("delivery_status", [
  "queued",
  "sent",
  "failed",
]);

export const missionStatus = pgEnum("mission_status", [
  "draft",
  "active",
  "closed",
]);

// ── Phase 3.1 — fusion engine ───────────────────────────────────────────
export const insightKind = pgEnum("insight_kind", [
  "correlation",
  "deviation",
  "pattern",
]);

export const patternScope = pgEnum("pattern_scope", [
  "entity",
  "industry",
  "global",
]);

export const patternStatus = pgEnum("pattern_status", [
  "candidate",
  "validated",
  "retired",
]);

export const patternSource = pgEnum("pattern_source", ["analyst", "auto"]);

export const predictionOutcome = pgEnum("prediction_outcome", [
  "pending",
  "hit",
  "miss",
]);

export const deviationKind = pgEnum("deviation_kind", [
  "burst",
  "inflection",
  "cohort",
]);

// ── Ops ─────────────────────────────────────────────────────────────────
export const costVendor = pgEnum("cost_vendor", [
  "firecrawl",
  "anthropic",
  "openai",
  "cloudflare_email",
  "r2",
  "other",
  // Phase 2.3 — paid data providers (every dollar attributed, law #6).
  "coresignal",
  "theirstack",
  "g2",
]);
