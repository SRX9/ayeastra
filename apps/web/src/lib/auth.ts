import { hasRoleAtLeast, type Role } from "@ayeastra/auth";
import { getWorkOS, withAuth, type UserInfo } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { cache } from "react";

import { getOrgBilling } from "@/lib/billing";

export type Session = UserInfo;

export type OrgSession = Session & { organizationId: string };

/**
 * Session of the signed-in user, or redirect to AuthKit sign-in.
 * Use in server components, server actions, and route handlers.
 */
export async function requireAuth(): Promise<Session> {
  return withAuth({ ensureSignedIn: true });
}

/** Session with an active organization, or redirect to /onboarding. */
export async function requireOrg(): Promise<OrgSession> {
  const session = await requireAuth();
  if (!session.organizationId) redirect("/onboarding");
  return session as OrgSession;
}

/**
 * Org session with at least the given role, or an error result — never a
 * throw, so server actions surface a message instead of an error page
 * (a stale client can invoke an action its user no longer has rights to).
 * Pages should gate UI on the session role instead of calling this.
 */
export async function requireRole(role: Role): Promise<OrgSession | { error: string }> {
  const session = await requireOrg();
  if (!hasRoleAtLeast(session.role, role)) {
    return { error: `This action requires the ${role} role.` };
  }
  return session;
}

/** Per-request-deduplicated org fetch — guards within a request share one API call. */
const getOrganization = cache((organizationId: string) =>
  getWorkOS().organizations.getOrganization(organizationId),
);

export type BilledOrgSession = OrgSession & {
  billing: { plan: string; pastDue: boolean };
};

/**
 * Org session with an active plan, or redirect to the paywall.
 * Entitlements live in WorkOS org metadata (written by the Stripe webhook
 * sync, or by hand for pilot/enterprise orgs — documentation/billing.md).
 * `past_due` does NOT lock the app (Stripe Smart Retries handle recovery);
 * callers should surface `billing.pastDue` as a banner instead.
 */
export async function requireActiveSubscription(): Promise<BilledOrgSession> {
  const session = await requireOrg();
  const organization = await getOrganization(session.organizationId);
  const plan = organization.metadata.plan;
  if (!plan || plan === "none") redirect("/settings/billing");

  // Banner-only signal — best effort, never blocks the page on the database.
  const pastDue = await getOrgBilling(session.organizationId)
    .then((billing) => billing?.status === "past_due")
    .catch(() => false);

  return { ...session, billing: { plan, pastDue } };
}
