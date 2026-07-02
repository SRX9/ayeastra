# Billing & Payments — Integration Plan (Stripe)

Status: **code implemented (§3); Stripe dashboard setup (§4) and the end-to-end test run (§6.5) still pending.** Maps the PRD pricing model ([Part 4](prd/04-business.md)) onto Stripe with the least code we can own. Buy-don't-build: hosted Stripe Checkout + hosted Customer Portal — we never render a card form, store a card, or build invoice/dunning UI.

---

## 1. Payment model — how PRD pricing maps to Stripe

| PRD offer | Stripe mechanism | Self-serve? |
|---|---|---|
| Baseline Dossier (free, one-time) | Nothing — no payment involved | — |
| Pilot $1,500 / 14 days | One-time **Payment Link** created in the Stripe dashboard. On conversion, the fee is credited via a customer-balance credit (manual, in dashboard). | No (sales-led) |
| Team $699/mo · $7,000/yr | Product **Team** with two flat prices (lookup keys `team_monthly`, `team_annual`) | Yes — Checkout |
| Business $1,800/mo · $18,000/yr | Product **Business** with two flat prices (`business_monthly`, `business_annual`) | Yes — Checkout |
| Enterprise from $4,000/mo | Subscription or quote created **manually in the Stripe dashboard** with a custom price. Flows through the same webhook sync — no special code path. | No (sales-led) |

Decisions baked into this mapping:

- **Flat plan prices, no metered/per-seat billing at launch.** Plans include fixed seat/entity allowances (Team: 5/10, Business: 20/30). The PRD's third axis (extra entities/seats, second module) becomes **add-on subscription items on the same subscription** when we need them — the architecture supports it with zero rework, so we don't build it now.
- **No trial, no freemium** (PRD principle). The Pilot *is* the trial and it's paid and sales-led. New orgs start unsubscribed and see a paywall.
- **Sales-led and self-serve share one pipeline.** Subscriptions created by hand in the Stripe dashboard fire the same webhooks as Checkout, so Enterprise deals sync automatically as long as the Stripe customer carries our org ID (see §3).

## 2. Source of truth & data flow

**Stripe owns billing state.** One webhook-driven sync fans it out:

```
Stripe (subscription) ──webhook──► sync ──► Postgres org_billing   (linkage + status, for our queries)
                                        └─► WorkOS org metadata     (plan, seatLimit — entitlements)
```

- Existing seat enforcement (`apps/web/src/lib/team.ts`, invite guards) reads WorkOS org metadata and **keeps working unchanged** — the webhook just starts writing the values, exactly as anticipated in [auth.md](auth.md).
- The sync is **re-fetch and upsert**: on any relevant event we re-fetch the subscription from Stripe and write the full derived state. Idempotent and order-insensitive — no event-replay bookkeeping needed.
- **Manual-plan escape hatch:** the sync only touches orgs that have a linked Stripe customer. Pilot/comped/enterprise-by-invoice orgs can have metadata set by hand in the WorkOS dashboard without the webhook clobbering it. Fine at 30–75 customers; revisit if ops pain appears.

New table in `packages/db` (`org_billing`):

| column | notes |
|---|---|
| `workosOrgId` (pk) | anchors tenancy, as everywhere |
| `stripeCustomerId` (unique) | created lazily on first Checkout |
| `stripeSubscriptionId` | nullable |
| `plan` | `team` \| `business` \| `enterprise` |
| `status` | Stripe subscription status (`active`, `past_due`, `canceled`, …) |
| `currentPeriodEnd`, `cancelAtPeriodEnd` | for the billing settings page |
| `createdAt`, `updatedAt` | |

## 3. Code changes (all in `apps/web` + shared packages)

The Express server is not involved — Checkout, Portal, and the webhook are all Next.js route handlers / server actions on Vercel.

1. **`packages/env`** — add to `web.ts`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Price IDs are *not* env vars — we resolve prices by lookup key at runtime (one less thing to misconfigure per environment).
2. **`packages/db`** — `org_billing` schema above + migration.
3. **`apps/web/src/lib/billing.ts`** — the only billing module:
   - Stripe client (pin API version).
   - Plan catalog: `{ team: { seats: 5, entities: 10 }, business: { seats: 20, entities: 30 } }` — single source for entitlements; price lookup keys → plan slugs.
   - `getOrCreateStripeCustomer(orgId)` — creates the customer with `metadata.workosOrgId`, stores the ID in `org_billing`. Sales follows the same convention when creating Enterprise customers by hand (documented in §5).
   - `syncSubscriptionToOrg(customerId)` — the re-fetch-and-upsert sync from §2.
4. **Checkout** — server action `startCheckoutAction(priceLookupKey)` (admin-only via `requireRole("admin")`): creates a `mode: "subscription"` Checkout Session with the org's customer, `client_reference_id` = org ID, `tax_id_collection` on, success/cancel URLs → `/settings/billing`.
5. **Webhook** — route handler `apps/web/src/app/api/webhooks/stripe/route.ts`: verify signature on the raw body; on `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed` → call `syncSubscriptionToOrg`. Excluded from the auth proxy in `apps/web/src/proxy.ts`.
6. **Billing settings page** — `/settings/billing` (admin-only), the page PRD Part 3 already lists under Settings:
   - No subscription → plan cards (Team/Business, monthly/annual toggle) → Checkout; plus "Talk to sales" (mailto/Cal link) for Pilot/Enterprise.
   - Active subscription → plan, status, renewal date, seats used vs limit, and a **"Manage billing"** button → Stripe Customer Portal session (plan switches between the four prices, payment method, invoices, cancellation all happen there — zero UI for us).
7. **Gating** — small `requireActiveSubscription()` guard next to `requireOrg()` in `apps/web/src/lib/auth.ts`: org metadata has no active plan → redirect to `/settings/billing`. `past_due` shows a banner but doesn't lock (Stripe Smart Retries + Portal handle recovery); `canceled`/`unpaid` returns to the paywall, data retained.
8. **Onboarding tweak** — `createOrganizationAction` stops defaulting to `plan: "team", seatLimit: "5"`; new orgs get `plan: "none", seatLimit: "1"` so a team can't be invited before payment. The webhook (or sales, manually) sets the real values.

## 4. One-time Stripe dashboard setup

(Test mode first, mirroring the WorkOS staging-first convention.)

1. **Products/prices**: Team + Business, each with monthly + annual flat prices, lookup keys `team_monthly`, `team_annual`, `business_monthly`, `business_annual`.
2. **Customer Portal**: enable plan switching restricted to those four prices; enable invoice history, payment-method update, cancellation (at period end).
3. **Stripe Tax**: enable; origin address + registrations as applicable. Checkout collects billing address + tax IDs.
4. **Smart Retries / dunning emails**: enable defaults.
5. **Payment Link**: Pilot, $1,500 one-time.
6. **Webhook endpoint**: the route from §3.5 with the listed events; copy the signing secret to `STRIPE_WEBHOOK_SECRET`.

## 5. Sales-led ops playbook (no code)

- **Pilot**: send the Payment Link → manually set the org's WorkOS metadata (`plan: "pilot"`, `seatLimit: "5"`) → on conversion, create the customer-balance credit and run Checkout (or build the subscription in-dashboard).
- **Enterprise**: create the Stripe customer **with `metadata.workosOrgId`**, attach the custom-price subscription or quote — the webhook syncs entitlements automatically. Custom seat/entity limits beyond the catalog: set org metadata manually.

## 6. Build order

1. Dashboard setup (§4, test mode) + env + `org_billing` schema.
2. `lib/billing.ts` + webhook sync — the core; verify with Stripe CLI (`stripe listen`/`trigger`).
3. Checkout action + `/settings/billing` page + Portal.
4. Gating (`requireActiveSubscription`) + onboarding default change.
5. End-to-end test-mode run: signup → org → paywall → Checkout (test card) → webhook unlocks seats → invite team → portal cancel → paywall returns.

## 7. Explicitly deferred

- Per-seat/metered billing, entity/seat add-on packs, second-module add-on items (architecture supports them as subscription items when needed).
- Self-serve annual→monthly downgrades beyond what the Portal allows; quotes/PO flows; multi-currency.
- Automated pilot provisioning and pilot-credit automation.
- Billing-driven WorkOS seat *revocation* edge cases (removing members when a downgrade shrinks seats) — at launch we block new invites over the limit but never auto-remove people.
