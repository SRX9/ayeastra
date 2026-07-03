import { getWorkOS } from "@workos-inc/authkit-nextjs";

// Plan and seat limit live in WorkOS organization metadata, written by the
// Stripe webhook sync (documentation/billing.md §2). New orgs start
// unsubscribed: no plan, one seat (the creator) — a team can't be invited
// before payment. The webhook (or sales, manually) sets the real values.
export const DEFAULT_PLAN = "none";
export const DEFAULT_SEAT_LIMIT = 1;

export interface TeamMember {
  membershipId: string;
  userId: string;
  email: string;
  name: string | null;
  profilePictureUrl: string | null;
  role: string;
  joinedAt: string;
}

export interface PendingInvitation {
  id: string;
  email: string;
  expiresAt: string;
}

export interface Team {
  organizationId: string;
  organizationName: string;
  plan: string;
  seatLimit: number;
  /** Active members + pending invitations — both occupy a seat. */
  seatsUsed: number;
  members: TeamMember[];
  invitations: PendingInvitation[];
}

// "0" is a valid limit (org locked, e.g. by billing); only missing or
// malformed metadata falls back to the default.
function parseSeatLimit(raw: string | undefined): number {
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_SEAT_LIMIT;
}

export async function getTeam(organizationId: string): Promise<Team> {
  const workos = getWorkOS();

  // Everything auto-paginates: a single 100-row page truncates the member
  // list and undercounts seatsUsed for orgs above 100 members, letting the
  // invite seat check pass when it shouldn't.
  const [organization, memberships, allInvitations, orgUsers] = await Promise.all([
    workos.organizations.getOrganization(organizationId),
    workos.userManagement
      .listOrganizationMemberships({ organizationId, statuses: ["active"] })
      .then((list) => list.autoPagination()),
    workos.userManagement
      .listInvitations({ organizationId })
      .then((list) => list.autoPagination()),
    workos.userManagement
      .listUsers({ organizationId })
      .then((list) => list.autoPagination()),
  ]);

  const usersById = new Map(orgUsers.map((user) => [user.id, user]));

  const members: TeamMember[] = memberships.map((membership) => {
    const user = usersById.get(membership.userId);
    const name = user ? [user.firstName, user.lastName].filter(Boolean).join(" ") : "";
    return {
      membershipId: membership.id,
      userId: membership.userId,
      email: user?.email ?? "unknown",
      name: name || null,
      profilePictureUrl: user?.profilePictureUrl ?? null,
      role: membership.role.slug,
      joinedAt: membership.createdAt,
    };
  });

  const pending: PendingInvitation[] = [];
  for (const invitation of allInvitations) {
    if (invitation.state !== "pending") continue;
    pending.push({
      id: invitation.id,
      email: invitation.email,
      expiresAt: invitation.expiresAt,
    });
  }

  return {
    organizationId: organization.id,
    organizationName: organization.name,
    plan: organization.metadata.plan ?? DEFAULT_PLAN,
    seatLimit: parseSeatLimit(organization.metadata.seatLimit),
    seatsUsed: members.length + pending.length,
    members,
    invitations: pending,
  };
}
