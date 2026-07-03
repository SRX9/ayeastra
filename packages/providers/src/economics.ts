/**
 * The economics gate (2.3, hard, per source): unit-economics-gated
 * enrichment. Both conditions must clear BEFORE activation, and the math is
 * persisted with the decision — incumbents bundle third-party data opaquely
 * and eat the margin; we don't.
 */

export const ECONOMICS_MAX_COST_SHARE = 0.15;
export const ECONOMICS_MIN_NAMED_REQUESTS = 5;

export interface EconomicsCase {
  /** Incremental provider cost per entity per month, from the vendor spike. */
  costPerEntityMonthUsd: number;
  /** Avg entities per org among orgs that would receive the data. */
  avgEntitiesPerOrg: number;
  /** Monthly revenue of the plan tier carrying the COGS. */
  planMonthlyRevenueUsd: number;
  /** Customers who asked for the capability BY NAME (pilot/CS log). */
  namedCustomerRequests: number;
}

export interface EconomicsDecision {
  allowed: boolean;
  /** (cost per entity × avg entities) / plan revenue — must be < 15%. */
  costShare: number;
  reasons: string[];
}

export function economicsGate(c: EconomicsCase): EconomicsDecision {
  const costShare =
    c.planMonthlyRevenueUsd > 0
      ? (c.costPerEntityMonthUsd * c.avgEntitiesPerOrg) / c.planMonthlyRevenueUsd
      : Infinity;
  const reasons: string[] = [];
  if (costShare >= ECONOMICS_MAX_COST_SHARE) {
    reasons.push(
      `cost share ${(costShare * 100).toFixed(1)}% ≥ ${ECONOMICS_MAX_COST_SHARE * 100}% of plan revenue`,
    );
  }
  if (c.namedCustomerRequests < ECONOMICS_MIN_NAMED_REQUESTS) {
    reasons.push(
      `${c.namedCustomerRequests} named requests < ${ECONOMICS_MIN_NAMED_REQUESTS} required`,
    );
  }
  return { allowed: reasons.length === 0, costShare, reasons };
}

/**
 * Plan gating (2.3): Business+ receive activated providers by default; Team
 * only as a priced add-on subscription item (billing.md §7). Contract lapse
 * → plan gate closes → collection falls back to free-tier coverage
 * (careers-page monitors) with the coverage page updated by the same gate.
 */
export function providerPlanGate(
  plan: "team" | "business" | "enterprise" | null,
  opts: { teamAddOn?: boolean } = {},
): boolean {
  if (plan === "business" || plan === "enterprise") return true;
  if (plan === "team") return opts.teamAddOn ?? false;
  return false;
}
