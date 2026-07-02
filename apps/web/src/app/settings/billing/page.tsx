import { hasRoleAtLeast } from "@ayeastra/auth";
import { Alert, Card } from "@heroui/react";
import type Stripe from "stripe";
import Link from "next/link";

import { requireOrg } from "@/lib/auth";
import { getOrgBilling, getSelfServePrices, isEntitledStatus, PLAN_CATALOG } from "@/lib/billing";
import { getTeam } from "@/lib/team";

import { ManageBillingButton } from "./manage-billing-button";
import { PlanCards, type PlanCardData, type PlanOffer } from "./plan-cards";

// Pilot and Enterprise are sales-led (billing.md §5). Update when a real
// sales inbox or Cal link exists.
const SALES_MAILTO = "mailto:sales@ayewatch.com?subject=AyeAstra%20Pilot%20%2F%20Enterprise";

function formatDate(value: Date) {
  return value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Intl.NumberFormat construction is expensive; reuse one formatter per currency.
const currencyFormatters = new Map<string, Intl.NumberFormat>();
function formatCurrency(currency: string, amount: number) {
  let formatter = currencyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    });
    currencyFormatters.set(currency, formatter);
  }
  return formatter.format(amount);
}

function toOffer(price: Stripe.Price | undefined): PlanOffer | null {
  if (!price?.unit_amount || !price.lookup_key) return null;
  const amount = formatCurrency(price.currency.toUpperCase(), price.unit_amount / 100);
  return { lookupKey: price.lookup_key, priceLabel: `${amount}/${price.recurring?.interval ?? "month"}` };
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const session = await requireOrg();

  if (!hasRoleAtLeast(session.role, "admin")) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-xl font-semibold">Billing</h1>
        <p className="mt-2 text-sm text-muted">
          Billing is managed by organization admins — ask one of them for plan changes.
        </p>
      </div>
    );
  }

  const [billing, team, params] = await Promise.all([
    getOrgBilling(session.organizationId),
    getTeam(session.organizationId),
    searchParams,
  ]);

  const subscribed = billing?.stripeSubscriptionId != null && isEntitledStatus(billing.status);

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Billing</h1>
        <p className="text-sm text-muted">{team.organizationName}</p>
      </div>

      {subscribed ? (
        <SubscriptionCard billing={billing} seatsUsed={team.seatsUsed} seatLimit={team.seatLimit} />
      ) : (
        <Paywall
          currentPlan={team.plan}
          justCheckedOut={params.checkout === "success"}
        />
      )}
    </div>
  );
}

function SubscriptionCard({
  billing,
  seatsUsed,
  seatLimit,
}: {
  billing: NonNullable<Awaited<ReturnType<typeof getOrgBilling>>>;
  seatsUsed: number;
  seatLimit: number;
}) {
  return (
    <Card>
      {billing.status === "past_due" && (
        <Alert status="danger" className="rounded-none border-0 border-b">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              Your last payment failed. Stripe is retrying — update your payment method below to
              keep access.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      <Card.Content>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Plan</dt>
            <dd className="font-medium capitalize">{billing.plan ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted">Status</dt>
            <dd className="font-medium capitalize">{billing.status?.replace("_", " ")}</dd>
          </div>
          <div>
            <dt className="text-muted">
              {billing.cancelAtPeriodEnd ? "Cancels on" : "Renews on"}
            </dt>
            <dd className="font-medium">
              {billing.currentPeriodEnd ? formatDate(billing.currentPeriodEnd) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Seats</dt>
            <dd className="font-medium">
              {seatsUsed} of {seatLimit} used
            </dd>
          </div>
        </dl>
      </Card.Content>
      <Card.Footer>
        <ManageBillingButton />
      </Card.Footer>
    </Card>
  );
}

async function Paywall({
  currentPlan,
  justCheckedOut,
}: {
  currentPlan: string;
  justCheckedOut: boolean;
}) {
  const prices = await getSelfServePrices();
  const plans: PlanCardData[] = [
    {
      name: "Team",
      ...PLAN_CATALOG.team,
      monthly: toOffer(prices.get("team_monthly")),
      annual: toOffer(prices.get("team_annual")),
    },
    {
      name: "Business",
      ...PLAN_CATALOG.business,
      monthly: toOffer(prices.get("business_monthly")),
      annual: toOffer(prices.get("business_annual")),
    },
  ];

  return (
    <div className="grid gap-4">
      {justCheckedOut && (
        <Alert status="success">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              Payment received — your plan activates as soon as Stripe confirms it (usually a few
              seconds). Refresh this page in a moment.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {/* Manually-provisioned plans (pilot, comped, enterprise-by-invoice) have
          no Stripe subscription but are still entitled. */}
      {currentPlan !== "none" && (
        <p className="text-sm text-muted">
          Current plan: <span className="font-medium capitalize">{currentPlan}</span> (managed by
          our team).
        </p>
      )}

      <PlanCards plans={plans} />

      <p className="text-sm text-muted">
        Running a pilot or need Enterprise?{" "}
        <Link href={SALES_MAILTO} className="link underline underline-offset-4">
          Talk to sales
        </Link>
        .
      </p>
    </div>
  );
}
