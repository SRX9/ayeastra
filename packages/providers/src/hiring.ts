import type { ProviderRecord } from "./provider";

/**
 * Shared hiring normalization — both hiring vendors (Coresignal, TheirStack)
 * emit the same extracted_facts shape, so the vendor choice from the spike
 * (2.3 checklist #2) never leaks past the adapter. Headcount by function,
 * seniority mix, senior roles: the classic early-warning inputs.
 */

const FUNCTION_KEYWORDS: Array<[string, RegExp]> = [
  ["engineering", /\b(engineer|developer|sre|devops|architect)\b/i],
  ["sales", /\b(sales|account executive|account manager|ae\b|sdr|bdr)\b/i],
  ["marketing", /\b(marketing|growth|content|seo|brand|pmm)\b/i],
  ["product", /\b(product manager|product owner|\bpm\b|product design)\b/i],
  ["design", /\b(designer|ux|ui\b)\b/i],
  ["customer_success", /\b(customer success|support|onboarding specialist)\b/i],
  ["data", /\b(data scientist|data engineer|analytics|machine learning|\bai\b)\b/i],
  ["operations", /\b(operations|finance|legal|people|recruit|hr\b)\b/i],
];

export function functionOfTitle(title: string): string {
  for (const [fn, re] of FUNCTION_KEYWORDS) {
    if (re.test(title)) return fn;
  }
  return "other";
}

const SENIOR = /\b(vp|vice president|chief|head of|director)\b/i;

export function isSeniorTitle(title: string): boolean {
  return SENIOR.test(title);
}

export interface JobPosting {
  title: string;
  location: string | null;
  postedAt: string | null;
}

/** extracted_facts for a hiring change — numbers here are what briefing
 * copy may cite (law #1: numbers come from extracted_facts). */
export function normalizeHiring(
  records: ProviderRecord[],
  getPosting: (r: ProviderRecord) => JobPosting,
): Record<string, unknown> {
  const postings = records.map(getPosting);
  const byFunction: Record<string, number> = {};
  const seniorRoles: string[] = [];
  for (const p of postings) {
    const fn = functionOfTitle(p.title);
    byFunction[fn] = (byFunction[fn] ?? 0) + 1;
    if (isSeniorTitle(p.title)) seniorRoles.push(p.title);
  }
  return {
    kind: "hiring",
    totalPostings: postings.length,
    byFunction,
    seniorRoles,
  };
}

export function describePosting(p: JobPosting): string {
  return `Job posting: ${p.title}${p.location ? ` — ${p.location}` : ""}${
    p.postedAt ? ` (posted ${p.postedAt})` : ""
  }`;
}
