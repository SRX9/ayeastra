import { env } from "@ayeastra/env/web";
import type Stripe from "stripe";

import { stripe, syncSubscriptionToOrg } from "@/lib/billing";

// Events the dashboard endpoint is configured to send (billing.md §4.6).
// Anything else acks without work, so over-broad config can't break us.
const HANDLED_EVENTS = new Set<Stripe.Event.Type>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  // Signature is computed over the raw body — read it before any parsing.
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (!HANDLED_EVENTS.has(event.type)) return Response.json({ received: true });

  // Every handled event carries the customer; the sync re-derives everything
  // else from Stripe, so we never trust the event payload's state.
  const object = event.data.object as { customer?: string | { id: string } | null };
  const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
  if (!customerId) return Response.json({ received: true });

  try {
    await syncSubscriptionToOrg(customerId);
  } catch (error) {
    console.error(`[billing] webhook sync failed (${event.type}, ${event.id})`, error);
    // Non-2xx makes Stripe retry; the sync is idempotent so replays are safe.
    return new Response("Sync failed", { status: 500 });
  }

  return Response.json({ received: true });
}
