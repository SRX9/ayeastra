import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Org ↔ Stripe linkage plus a queryable mirror of subscription state.
 * Stripe owns billing state; the webhook sync re-fetches and upserts here
 * (see documentation/billing.md §2). Entitlements (plan, seatLimit) are
 * fanned out to WorkOS org metadata, not read from this table.
 */
export const orgBilling = pgTable("org_billing", {
  workosOrgId: text("workos_org_id").primaryKey(),
  // Created lazily on first Checkout (or by hand for sales-led deals).
  stripeCustomerId: text("stripe_customer_id").notNull().unique(),
  stripeSubscriptionId: text("stripe_subscription_id"),
  /** "team" | "business" | "enterprise" — null until a subscription exists. */
  plan: text("plan"),
  /** Stripe subscription status ("active", "past_due", "canceled", …). */
  status: text("status"),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type OrgBilling = typeof orgBilling.$inferSelect;
export type NewOrgBilling = typeof orgBilling.$inferInsert;
