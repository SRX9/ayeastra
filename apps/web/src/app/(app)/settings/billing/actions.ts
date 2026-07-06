"use server";

import { env } from "@ayeastra/env/web";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/lib/auth";
import {
  getOrCreateStripeCustomer,
  getOrgBilling,
  isEntitledStatus,
  PRICE_LOOKUP_KEYS,
  stripe,
} from "@/lib/billing";

export interface BillingActionState {
  error?: string;
}

const BILLING_PATH = "/settings/billing";
// The app origin — the WorkOS redirect URI always lives on it, so we don't
// need a separate APP_URL env var per environment.
const appOrigin = new URL(env.NEXT_PUBLIC_WORKOS_REDIRECT_URI).origin;

const lookupKeySchema = z.enum(PRICE_LOOKUP_KEYS);

export async function startCheckoutAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const session = await requireRole("admin");
  if ("error" in session) return { error: session.error };

  const parsed = lookupKeySchema.safeParse(formData.get("priceLookupKey"));
  if (!parsed.success) return { error: "Unknown plan." };

  // A second Checkout would create a second subscription and double-charge —
  // plan changes for subscribed orgs go through the Customer Portal only.
  const existing = await getOrgBilling(session.organizationId);
  if (existing && isEntitledStatus(existing.status)) {
    return { error: "This organization already has a subscription — use “Manage billing” to change plans." };
  }

  let checkoutUrl: string;
  try {
    const customerId = await getOrCreateStripeCustomer(session.organizationId);
    const prices = await stripe.prices.list({ lookup_keys: [parsed.data], limit: 1 });
    const price = prices.data[0];
    if (!price) {
      return { error: "This plan isn't configured in Stripe yet. See documentation/billing.md §4." };
    }

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: session.organizationId,
      line_items: [{ price: price.id, quantity: 1 }],
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      billing_address_collection: "required",
      // Required so Checkout may save the collected name/address/tax id onto
      // the existing customer (Stripe Tax needs them on renewal invoices).
      customer_update: { name: "auto", address: "auto" },
      success_url: `${appOrigin}${BILLING_PATH}?checkout=success`,
      cancel_url: `${appOrigin}${BILLING_PATH}`,
    });
    if (!checkout.url) return { error: "Stripe did not return a Checkout URL. Please try again." };
    checkoutUrl = checkout.url;
  } catch (error) {
    console.error("[billing] failed to start checkout", error);
    return { error: "Could not start checkout. Please try again." };
  }

  // Cast: typedRoutes can't know external URLs; redirect supports them.
  redirect(checkoutUrl as Route);
}

export async function openBillingPortalAction(
  _prev: BillingActionState,
  _formData: FormData,
): Promise<BillingActionState> {
  const session = await requireRole("admin");
  if ("error" in session) return { error: session.error };

  const billing = await getOrgBilling(session.organizationId);
  if (!billing) return { error: "No billing account exists for this organization yet." };

  let portalUrl: string;
  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: billing.stripeCustomerId,
      return_url: `${appOrigin}${BILLING_PATH}`,
    });
    portalUrl = portal.url;
  } catch (error) {
    console.error("[billing] failed to open billing portal", error);
    return { error: "Could not open the billing portal. Please try again." };
  }

  redirect(portalUrl as Route);
}
