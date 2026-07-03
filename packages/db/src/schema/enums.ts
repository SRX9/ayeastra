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

// ── Ops ─────────────────────────────────────────────────────────────────
export const costVendor = pgEnum("cost_vendor", [
  "firecrawl",
  "anthropic",
  "openai",
  "cloudflare_email",
  "r2",
  "other",
]);
