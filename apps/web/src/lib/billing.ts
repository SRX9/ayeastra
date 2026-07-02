import { getDb, orgBilling, type OrgBilling } from "@ayeastra/db";
import { env } from "@ayeastra/env/web";
import { getWorkOS } from "@workos-inc/authkit-nextjs";
import { eq } from "drizzle-orm";
import Stripe from "stripe";

// Pinned to the version the installed SDK ships with, so a dashboard API
// upgrade can't change payload shapes underneath us.
export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-05-27.dahlia",
});

/**
 * Self-serve plan catalog — the single source for entitlements (PRD Part 4).
 * Enterprise is intentionally absent: limits are negotiated per deal and set
 * in WorkOS org metadata by sales (documentation/billing.md §5).
 */
export const PLAN_CATALOG = {
  team: { seats: 5, entities: 10 },
  business: { seats: 20, entities: 30 },
} as const;

export type SelfServePlan = keyof typeof PLAN_CATALOG;

/** Stripe price lookup keys for the self-serve plans (dashboard setup, §4). */
export const PRICE_LOOKUP_KEYS = [
  "team_monthly",
  "team_annual",
  "business_monthly",
  "business_annual",
] as const;

export type PriceLookupKey = (typeof PRICE_LOOKUP_KEYS)[number];

export type Plan = SelfServePlan | "enterprise";

/** `team_monthly` → `team`; any custom (sales-created) price → `enterprise`. */
function planFromLookupKey(lookupKey: string | null): Plan {
  const slug = lookupKey?.split("_")[0];
  return slug && slug in PLAN_CATALOG ? (slug as SelfServePlan) : "enterprise";
}

/** Statuses that keep entitlements: past_due stays unlocked while Stripe retries. */
const ENTITLED_STATUSES = new Set<Stripe.Subscription.Status>([
  "active",
  "trialing",
  "past_due",
]);

/** True when this status should drive the subscription view / block a new Checkout. */
export function isEntitledStatus(status: string | null | undefined): boolean {
  return !!status && ENTITLED_STATUSES.has(status as Stripe.Subscription.Status);
}

export async function getOrgBilling(organizationId: string): Promise<OrgBilling | null> {
  const row = await getDb().query.orgBilling.findFirst({
    where: eq(orgBilling.workosOrgId, organizationId),
  });
  return row ?? null;
}

/** The four self-serve prices, keyed by lookup key. Missing keys mean the dashboard setup (§4) is incomplete. */
export async function getSelfServePrices(): Promise<Map<string, Stripe.Price>> {
  const prices = await stripe.prices.list({
    lookup_keys: [...PRICE_LOOKUP_KEYS],
    limit: PRICE_LOOKUP_KEYS.length,
  });
  return new Map(prices.data.map((price) => [price.lookup_key ?? "", price]));
}

/**
 * Returns the org's Stripe customer ID, creating the customer lazily on first
 * use. `metadata.workosOrgId` is the linkage convention — sales follows it
 * when creating Enterprise customers by hand (documentation/billing.md §5).
 */
export async function getOrCreateStripeCustomer(organizationId: string): Promise<string> {
  const db = getDb();
  const existing = await db.query.orgBilling.findFirst({
    where: eq(orgBilling.workosOrgId, organizationId),
  });
  if (existing) return existing.stripeCustomerId;

  const organization = await getWorkOS().organizations.getOrganization(organizationId);
  const customer = await stripe.customers.create({
    name: organization.name,
    metadata: { workosOrgId: organizationId },
  });

  // Two concurrent first checkouts can race; the loser's customer stays
  // orphaned in Stripe (harmless — no subscription) and we keep the winner.
  await db
    .insert(orgBilling)
    .values({ workosOrgId: organizationId, stripeCustomerId: customer.id })
    .onConflictDoNothing({ target: orgBilling.workosOrgId });
  const row = await db.query.orgBilling.findFirst({
    where: eq(orgBilling.workosOrgId, organizationId),
  });
  return row?.stripeCustomerId ?? customer.id;
}

/** Prefer the subscription that should drive entitlements; fall back to the newest. */
function pickCurrentSubscription(subscriptions: Stripe.Subscription[]): Stripe.Subscription | null {
  // Index by status once (first in array order wins) so the priority scan below
  // is O(statuses) instead of a fresh linear .find() per status.
  const firstByStatus = new Map<Stripe.Subscription.Status, Stripe.Subscription>();
  for (const subscription of subscriptions) {
    if (!firstByStatus.has(subscription.status)) firstByStatus.set(subscription.status, subscription);
  }
  for (const status of ["active", "trialing", "past_due"] as const) {
    const match = firstByStatus.get(status);
    if (match) return match;
  }
  return subscriptions.toSorted((a, b) => b.created - a.created)[0] ?? null;
}

/**
 * The webhook-driven sync (documentation/billing.md §2): re-fetch the
 * customer's subscription state from Stripe and write the full derived state
 * to Postgres (org_billing) and WorkOS org metadata (entitlements).
 * Idempotent and order-insensitive — safe to run on any event, any number of
 * times. Customers without `metadata.workosOrgId` are skipped, which is what
 * keeps manual-plan orgs (pilot/comped) out of the sync's reach.
 */
export async function syncSubscriptionToOrg(stripeCustomerId: string): Promise<void> {
  const customer = await stripe.customers.retrieve(stripeCustomerId);
  if (customer.deleted) {
    // Deleting a customer cancels its subscriptions, but by the time those
    // events arrive the metadata link is gone — resolve the org from our own
    // linkage and revoke entitlements instead of leaving them orphaned.
    const row = await getDb().query.orgBilling.findFirst({
      where: eq(orgBilling.stripeCustomerId, stripeCustomerId),
    });
    if (!row) return;
    await getDb()
      .update(orgBilling)
      .set({
        stripeSubscriptionId: null,
        plan: null,
        status: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        updatedAt: new Date(),
      })
      .where(eq(orgBilling.workosOrgId, row.workosOrgId));
    await getWorkOS().organizations.updateOrganization({
      organization: row.workosOrgId,
      metadata: { plan: "none", seatLimit: "1" },
    });
    return;
  }

  const workosOrgId = customer.metadata.workosOrgId;
  if (!workosOrgId) {
    console.warn(`[billing] customer ${stripeCustomerId} has no workosOrgId metadata; skipping`);
    return;
  }

  const subscriptions = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: "all",
    limit: 100,
  });
  const subscription = pickCurrentSubscription(subscriptions.data);

  const plan = subscription
    ? planFromLookupKey(subscription.items.data[0]?.price.lookup_key ?? null)
    : null;
  // current_period_end lives on subscription items since API 2025-03; the
  // latest item end is the renewal date we show.
  const periodEnds = subscription?.items.data.map((item) => item.current_period_end) ?? [];
  const currentPeriodEnd = periodEnds.length
    ? new Date(Math.max(...periodEnds) * 1000)
    : null;

  await getDb()
    .insert(orgBilling)
    .values({
      workosOrgId,
      stripeCustomerId,
      stripeSubscriptionId: subscription?.id ?? null,
      plan,
      status: subscription?.status ?? null,
      currentPeriodEnd,
      cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false,
    })
    .onConflictDoUpdate({
      target: orgBilling.workosOrgId,
      set: {
        stripeCustomerId,
        stripeSubscriptionId: subscription?.id ?? null,
        plan,
        status: subscription?.status ?? null,
        currentPeriodEnd,
        cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false,
        updatedAt: new Date(),
      },
    });

  // Fan out entitlements. Existing seat enforcement (lib/team.ts) reads these.
  const workos = getWorkOS();
  if (!subscription || !plan || !ENTITLED_STATUSES.has(subscription.status)) {
    await workos.organizations.updateOrganization({
      organization: workosOrgId,
      metadata: { plan: "none", seatLimit: "1" },
    });
  } else if (plan === "enterprise") {
    // Enterprise limits are negotiated and set manually; only fill a floor
    // when nothing is set yet so the sync never clobbers a custom limit.
    const organization = await workos.organizations.getOrganization(workosOrgId);
    await workos.organizations.updateOrganization({
      organization: workosOrgId,
      metadata: {
        plan: "enterprise",
        seatLimit: organization.metadata.seatLimit || String(PLAN_CATALOG.business.seats),
      },
    });
  } else {
    await workos.organizations.updateOrganization({
      organization: workosOrgId,
      metadata: { plan, seatLimit: String(PLAN_CATALOG[plan].seats) },
    });
  }
}
