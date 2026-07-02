"use server";

import { ASSIGNABLE_ROLES, canManageRole, hasRoleAtLeast } from "@ayeastra/auth";
import { getWorkOS } from "@workos-inc/authkit-nextjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth";
import { getTeam } from "@/lib/team";

export interface ActionState {
  error?: string;
  success?: string;
}

/** Echoes submitted values back so a failed invite doesn't wipe the form. */
export interface InviteState extends ActionState {
  email?: string;
  role?: string;
}

const TEAM_PATH = "/settings/team";

const inviteSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  role: z.enum(ASSIGNABLE_ROLES),
});

async function countAdmins(organizationId: string): Promise<number> {
  const memberships = await getWorkOS().userManagement.listOrganizationMemberships({
    organizationId,
    statuses: ["active"],
    limit: 100,
  });
  return memberships.data.filter((m) => hasRoleAtLeast(m.role.slug, "admin")).length;
}

export async function inviteMemberAction(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const emailInput = formData.get("email");
  const roleInput = formData.get("role");
  const submitted = {
    email: typeof emailInput === "string" ? emailInput : "",
    role: typeof roleInput === "string" ? roleInput : "member",
  };

  const session = await requireRole("admin");
  if ("error" in session) return { ...submitted, error: session.error };

  const parsed = inviteSchema.safeParse(submitted);
  if (!parsed.success) return { ...submitted, error: "Enter a valid email address and role." };
  const { email, role } = parsed.data;

  const team = await getTeam(session.organizationId);
  if (team.seatsUsed >= team.seatLimit) {
    return {
      ...submitted,
      error: `All ${team.seatLimit} seats are in use. Remove a member or revoke a pending invitation first.`,
    };
  }
  if (team.members.some((member) => member.email.toLowerCase() === email)) {
    return { ...submitted, error: `${email} is already a member.` };
  }
  if (team.invitations.some((invitation) => invitation.email.toLowerCase() === email)) {
    return { ...submitted, error: `${email} already has a pending invitation.` };
  }

  try {
    await getWorkOS().userManagement.sendInvitation({
      email,
      organizationId: session.organizationId,
      roleSlug: role,
      inviterUserId: session.user.id,
    });
  } catch (error) {
    console.error("[team] failed to send invitation", error);
    return { ...submitted, error: "Could not send the invitation. Please try again." };
  }

  revalidatePath(TEAM_PATH);
  return { success: `Invitation sent to ${email}.` };
}

export async function removeMemberAction(membershipId: string): Promise<ActionState> {
  const session = await requireRole("admin");
  if ("error" in session) return session;
  if (typeof membershipId !== "string" || !membershipId) return { error: "Invalid member." };

  const workos = getWorkOS();
  try {
    const membership = await workos.userManagement.getOrganizationMembership(membershipId);
    if (membership.organizationId !== session.organizationId) return { error: "Member not found." };
    if (membership.userId === session.user.id) {
      return { error: "You can't remove yourself from the organization." };
    }
    if (!canManageRole(session.role, membership.role.slug)) {
      return { error: "You can't remove a member with a higher role than yours." };
    }
    if (
      hasRoleAtLeast(membership.role.slug, "admin") &&
      (await countAdmins(session.organizationId)) <= 1
    ) {
      return { error: "The organization needs at least one admin." };
    }
    await workos.userManagement.deleteOrganizationMembership(membershipId);
  } catch (error) {
    console.error("[team] failed to remove member", error);
    return { error: "Could not remove the member. Please try again." };
  }

  revalidatePath(TEAM_PATH);
  return {};
}

export async function updateMemberRoleAction(
  membershipId: string,
  role: string,
): Promise<ActionState> {
  const session = await requireRole("admin");
  if ("error" in session) return session;
  const parsedRole = z.enum(ASSIGNABLE_ROLES).safeParse(role);
  if (typeof membershipId !== "string" || !membershipId || !parsedRole.success) {
    return { error: "Invalid role change." };
  }

  const workos = getWorkOS();
  try {
    const membership = await workos.userManagement.getOrganizationMembership(membershipId);
    if (membership.organizationId !== session.organizationId) return { error: "Member not found." };
    if (membership.userId === session.user.id) {
      return { error: "You can't change your own role." };
    }
    if (!canManageRole(session.role, membership.role.slug)) {
      return { error: "You can't change the role of a member with a higher role than yours." };
    }
    const demotingAdmin =
      hasRoleAtLeast(membership.role.slug, "admin") && !hasRoleAtLeast(parsedRole.data, "admin");
    if (demotingAdmin && (await countAdmins(session.organizationId)) <= 1) {
      return { error: "The organization needs at least one admin." };
    }
    await workos.userManagement.updateOrganizationMembership(membershipId, {
      roleSlug: parsedRole.data,
    });
  } catch (error) {
    console.error("[team] failed to update member role", error);
    return { error: "Could not update the role. Please try again." };
  }

  revalidatePath(TEAM_PATH);
  return {};
}

export async function revokeInvitationAction(invitationId: string): Promise<ActionState> {
  const session = await requireRole("admin");
  if ("error" in session) return session;
  if (typeof invitationId !== "string" || !invitationId) return { error: "Invalid invitation." };

  const workos = getWorkOS();
  try {
    const invitation = await workos.userManagement.getInvitation(invitationId);
    if (invitation.organizationId !== session.organizationId) {
      return { error: "Invitation not found." };
    }
    await workos.userManagement.revokeInvitation(invitationId);
  } catch (error) {
    console.error("[team] failed to revoke invitation", error);
    return { error: "Could not revoke the invitation. Please try again." };
  }

  revalidatePath(TEAM_PATH);
  return {};
}
