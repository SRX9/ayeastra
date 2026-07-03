import { createHash } from "node:crypto";

/**
 * Stage 0 (diff doc): normalize Firecrawl markdown so volatile tokens never
 * masquerade as changes, then hash. ~95% of checks end at the hash gate.
 *
 * VERSIONED: bump on any rule change and never diff across versions —
 * re-hash the previous snapshot first (diff doc, failure modes).
 */
export const NORMALIZER_VERSION = 1;

/** Volatile patterns stripped for every kind. Conservative by design: a
 * false negative costs one model call; a false positive hides a change. */
const BASE_RULES: Array<[RegExp, string]> = [
  // Zero-width and BOM characters.
  [/[​-‍﻿]/g, ""],
  // Relative timestamps ("3 hours ago", "posted 2 days ago").
  [/\b(?:posted\s+)?\d+\s+(?:second|minute|hour|day|week)s?\s+ago\b/gi, "<t>"],
  // "today"/"yesterday" renderings of dates.
  [/\b(?:today|yesterday)\b/gi, "<t>"],
  // Session/tracking ids in URLs.
  [/[?&](?:utm_[a-z]+|sessionid|sid|ref|fbclid|gclid)=[^\s)&"']*/gi, ""],
  // Cookie-banner remnants Firecrawl sometimes captures.
  [/^.*\b(?:we use cookies|accept all cookies|cookie settings|cookie policy)\b.*$/gim, ""],
  // Current year in copyright footers.
  [/(©|\(c\)|copyright)\s*\d{4}/gi, "$1"],
];

const KIND_RULES: Record<string, Array<[RegExp, string]>> = {
  // Careers pages love applicant/viewer counters.
  careers: [[/\b\d+\s+(?:applicants?|views?|people viewed)\b/gi, "<n>"]],
  // News/blog feeds render precise publish clocks.
  news: [[/\b\d{1,2}:\d{2}\s*(?:am|pm|AM|PM)?\b/g, "<t>"]],
};

export function normalizeMarkdown(markdown: string, kind: string): string {
  let out = markdown.replace(/\r\n/g, "\n");
  for (const [re, sub] of [...BASE_RULES, ...(KIND_RULES[kind] ?? [])]) {
    out = out.replace(re, sub);
  }
  // Collapse runs of whitespace so renderer drift doesn't read as change.
  return out
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** SHA-256 hex over normalized content — snapshots.content_hash. */
export function contentHash(normalized: string): string {
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
