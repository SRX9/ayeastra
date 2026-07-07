# Billing & Payments — Stripe Integration

Status: **code implemented (§3); Stripe dashboard setup (§4) and the end-to-end test run (§6.5) still pending.** Buy-don't-build: hosted Stripe Checkout + hosted Customer Portal — we never render a card form, store a card, or build invoice/dunning UI.

---

## 1. Payment model

Account creation is free and self-serve: anyone can sign up, create an org, and complete onboarding. Paid plans gate generation (new briefings, alerts), not the account itself.

| Offer | Stripe mechanism | Self-serve? |
| --- | --- | --- |
| Team $699/mo · $7,000/yr | Product **Team** with two flat prices (lookup keys `team_monthly`, `team_annual`) | Yes — Checkout |
| Business $1,800/mo · $18,000/yr | Product **Business** with two flat prices (`business_monthly`, `business_annual`) | Yes — Checkout |
| Enterprise from $4,000/mo | Subscription or quote created **manually in the Stripe dashboard** with a custom price. Flows through the same webhook sync — no special code path. | No (sales-led) |
| Module add-ons | Extra subscription items on the same subscription with `module_*` lookup keys. Presence of an item activates the module for the org; its removal (or losing entitlement) gates the module's new output while preserving history. | Via Portal / sales |

Decisions baked into this mapping:

- **Flat plan prices, no metered/per-seat billing at launch.** Plans include fixed seat/entity allowances (Team: 5 seats / 10 entities, Business: 20 / 30). The catalog lives in code (`PLAN_CATALOG` in `apps/web/src/lib/billing.ts`) as the single source for entitlements.
- **No free tier of the product itself.** New orgs start unsubscribed (`plan: "none"`, `seatLimit: "1"`) and see the paywall at `/settings/billing`; they can't invite a team before payment.
- **Sales-led and self-serve share one pipeline.** Subscriptions created by hand in the Stripe dashboard fire the same webhooks as Checkout, so Enterprise deals sync automatically as long as the Stripe customer carries our org ID (see §3).

## 2. Source of truth & data flow

**Stripe owns billing state.** One webhook-driven sync fans it out:

```text
Stripe (subscription) ──webhook──► sync ──► Postgres org_billing   (linkage + status, for our queries)
                                        ├─► Postgres org_modules   (billing-sourced module activation)
                                        └─► WorkOS org metadata     (plan, seatLimit — entitlements)
```

- Existing seat enforcement (`apps/web/src/lib/team.ts`, invite guards) reads WorkOS org metadata — the webhook writes the values, exactly as anticipated in [auth.md](auth.md).
- The sync is **re-fetch and upsert**: on any relevant event we re-fetch the customer's full subscription state from Stripe and write the derived state. Idempotent and order-insensitive — no event-replay bookkeeping needed.
- **Entitled statuses** are `active`, `trialing`, `past_due` — `past_due` stays unlocked while Stripe Smart Retries run. Any other status (or no subscription) resets metadata to `plan: "none"`, `seatLimit: "1"`.
- **Plan derivation**: the base plan comes from the first subscription item whose lookup key is *not* a `module_*` add-on; `team_*`/`business_*` map to the catalog, any custom (sales-created) price maps to `enterprise`. Enterprise seat limits are negotiated: the sync only fills a floor when metadata is empty and never clobbers a manually set limit.
- **Module add-ons**: `module_*` items upsert `org_modules` rows with `source: "billing"`; losing entitlement deactivates billing-sourced rows. `source: "manual"` rows (design-partner betas) are never touched by the sync.
- **Deleted customers**: deleting a Stripe customer severs the metadata link before the cancellation events arrive, so the sync resolves the org from our own `org_billing` linkage and revokes entitlements rather than leaving them orphaned.
- **Manual-plan escape hatch:** the sync only touches orgs whose Stripe customer carries `metadata.workosOrgId`. Comped / enterprise-by-invoice orgs can have metadata set by hand in the WorkOS dashboard without the webhook clobbering it. Fine at 30–75 customers; revisit if ops pain appears.

Table in `packages/db` (`org_billing`):

| column | notes |
| --- | --- |
| `workosOrgId` (pk) | anchors tenancy, as everywhere |
| `stripeCustomerId` (unique) | created lazily on first Checkout |
| `stripeSubscriptionId` | nullable |
| `plan` | `team` \| `business` \| `enterprise` |
| `status` | Stripe subscription status (`active`, `past_due`, `canceled`, …) |
| `currentPeriodEnd`, `cancelAtPeriodEnd` | for the billing settings page (`currentPeriodEnd` is the latest item period end — the API moved it onto items) |
| `createdAt`, `updatedAt` | |

## 3. Implementation (all in `apps/web` + shared packages)

The Express server is not involved — Checkout, Portal, and the webhook are all Next.js route handlers / server actions on Vercel.

1. **`packages/env`** — `web.ts` carries `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Price IDs are *not* env vars — we resolve prices by lookup key at runtime (one less thing to misconfigure per environment).
2. **`packages/db`** — `org_billing` schema above.
3. **`apps/web/src/lib/billing.ts`** — the only billing module:
   - Stripe client with a pinned API version (so a dashboard API upgrade can't change payload shapes underneath us).
   - `PLAN_CATALOG`, `PRICE_LOOKUP_KEYS`, plan/lookup-key mapping.
   - `getOrCreateStripeCustomer(orgId)` — creates the customer with `metadata.workosOrgId`, stores the ID in `org_billing` (concurrent first checkouts race safely via `onConflictDoNothing`). Sales follows the same convention when creating Enterprise customers by hand (§5).
   - `syncSubscriptionToOrg(customerId)` — the re-fetch-and-upsert sync from §2, including module add-on sync and deleted-customer revocation.
4. **Checkout** — server action `startCheckoutAction` (`settings/billing/actions.ts`, admin-only via `requireRole("admin")`): creates a `mode: "subscription"` Checkout Session with the org's customer, `client_reference_id` = org ID, automatic tax + tax-ID collection + required billing address, success/cancel URLs → `/settings/billing`. Orgs with an entitled subscription are blocked from a second Checkout (a second session would double-charge) — plan changes go through the Portal.
5. **Webhook** — route handler `apps/web/src/app/api/webhooks/stripe/route.ts`: verify signature on the raw body; on `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed` → `syncSubscriptionToOrg`. Excluded from the auth proxy in `apps/web/src/proxy.ts`.
6. **Billing settings page** — `/settings/billing` (admin-only; non-admins see a pointer to their admins):
   - No subscription → plan cards (Team/Business, monthly/annual toggle, prices fetched live from Stripe by lookup key) → Checkout; plus "Talk to sales" (mailto) for Enterprise. Manually-provisioned plans (comped, enterprise-by-invoice) show a "managed by our team" note above the cards.
   - Active subscription → plan, status, renewal/cancellation date, seats used vs limit, past-due banner, and a **"Manage billing"** button → Stripe Customer Portal session (plan switches, payment method, invoices, cancellation all happen there — zero UI for us).
7. **Gating** — `requireActiveSubscription()` in `apps/web/src/lib/auth.ts`: org metadata has no active plan → redirect to `/settings/billing`. `past_due` surfaces as a banner but doesn't lock (Stripe Smart Retries + Portal handle recovery); `canceled`/`unpaid` returns to the paywall, data retained — nothing collected is deleted.
8. **Onboarding** — new orgs get `plan: "none"`, `seatLimit: "1"`; the webhook (or sales, manually) sets the real values.

## 4. One-time Stripe dashboard setup

(Test mode first, mirroring the WorkOS staging-first convention.)

1. **Products/prices**: Team + Business, each with monthly + annual flat prices, lookup keys `team_monthly`, `team_annual`, `business_monthly`, `business_annual`. Module add-on prices use `module_<key>` lookup keys.
2. **Customer Portal**: enable plan switching restricted to the four self-serve prices; enable invoice history, payment-method update, cancellation (at period end).
3. **Stripe Tax**: enable; origin address + registrations as applicable. Checkout collects billing address + tax IDs.
4. **Smart Retries / dunning emails**: enable defaults.
5. **Webhook endpoint**: the route from §3.5 with the listed events; copy the signing secret to `STRIPE_WEBHOOK_SECRET`.

## 5. Sales-led ops playbook (no code)

- **Enterprise**: create the Stripe customer **with `metadata.workosOrgId`**, attach the custom-price subscription or quote — the webhook syncs entitlements automatically. Custom seat/entity limits beyond the catalog: set org metadata manually (the sync never overwrites a manually set enterprise seat limit).
- **Comped / by-invoice orgs**: skip Stripe entirely — set `plan` and `seatLimit` in WorkOS org metadata by hand; orgs without a linked Stripe customer are outside the sync's reach.

## 6. Remaining work

1. Dashboard setup (§4, test mode) + production env vars.
2. Verify the webhook sync with Stripe CLI (`stripe listen`/`trigger`).
3. End-to-end test-mode run: signup → org → paywall → Checkout (test card) → webhook unlocks seats → invite team → portal cancel → paywall returns.

## 7. Explicitly deferred

- Per-seat/metered billing, entity/seat add-on packs (the architecture supports them as subscription items when needed).
- Self-serve annual→monthly downgrades beyond what the Portal allows; quotes/PO flows; multi-currency.
- Billing-driven WorkOS seat *revocation* edge cases (removing members when a downgrade shrinks seats) — at launch we block new invites over the limit but never auto-remove people.
