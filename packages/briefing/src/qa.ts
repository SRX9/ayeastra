/**
 * The QA gate (briefing doc step 5) — code, not vibes. Citation validation
 * happens in packages/ai's validator; these are the two briefing-specific
 * checks: numeric cross-check (catches the invented "$399") and confidence
 * lint (predictive claims must hedge). Fail → regenerate once → drop the
 * section and log; a shorter honest briefing beats a padded one.
 */

export interface QaIssue {
  check: "numeric" | "confidence";
  detail: string;
}

/**
 * Every number in section text must appear in the cited extracted_facts.
 * Numbers are compared as normalized strings ("1,200" ≡ "1200" ≡ "1200.0").
 */
export function numericCrossCheck(
  sectionText: string,
  citedFacts: unknown[],
): QaIssue[] {
  const allowed = new Set<string>();
  for (const fact of citedFacts) {
    for (const n of extractNumbers(JSON.stringify(fact))) allowed.add(n);
  }
  const issues: QaIssue[] = [];
  for (const n of extractNumbers(sectionText)) {
    if (!allowed.has(n)) {
      issues.push({
        check: "numeric",
        detail: `number "${n}" does not appear in any cited extracted_facts — cite a fact containing it or remove it`,
      });
    }
  }
  return issues;
}

const NUMBER_RE = /\d[\d,]*(?:\.\d+)?/g;

export function extractNumbers(text: string): string[] {
  return (text.match(NUMBER_RE) ?? []).map((n) =>
    normalizeNumber(n),
  );
}

function normalizeNumber(raw: string): string {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? String(n) : raw;
}

const PREDICTIVE_RE =
  /\b(?:likely|expect(?:s|ed)?|will probably|anticipat\w+|signals? that they will|poised to)\b/i;
const CONFIDENCE_MARKER_RE =
  /\b(?:high|moderate|low)\s+confidence\b|\bconfidence:\s*(?:high|moderate|low)\b/i;

/** Any predictive claim must carry a confidence marker in the same block. */
export function confidenceLint(blocks: string[]): QaIssue[] {
  const issues: QaIssue[] = [];
  for (const block of blocks) {
    if (PREDICTIVE_RE.test(block) && !CONFIDENCE_MARKER_RE.test(block)) {
      issues.push({
        check: "confidence",
        detail: `predictive claim without a confidence marker: "${block.slice(0, 80)}…"`,
      });
    }
  }
  return issues;
}
