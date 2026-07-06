"use server";

import { getWorkOS, switchToOrganization } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAuth } from "@/lib/auth";
import { DEFAULT_PLAN, DEFAULT_SEAT_LIMIT } from "@/lib/team";

const schema = z.object({
  name: z.string().trim().min(2).max(64),
});

export interface OnboardingState {
  error?: string;
}

export async function createOrganizationAction(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const session = await requireAuth();
  if (session.organizationId) redirect("/dashboard");

  const workos = getWorkOS();

  // Already a member somewhere (e.g. accepted an invite elsewhere)? Join that
  // org instead of creating a duplicate — one org per user at launch.
  const existing = await workos.userManagement.listOrganizationMemberships({
    userId: session.user.id,
    statuses: ["active"],
    limit: 1,
  });
  const membership = existing.data[0];
  if (membership) {
    await switchToOrganization(membership.organizationId);
    redirect("/dashboard");
  }

  const parsed = schema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: "Organization name must be between 2 and 64 characters." };
  }

  let organizationId: string;
  try {
    const organization = await workos.organizations.createOrganization({
      name: parsed.data.name,
      metadata: { plan: DEFAULT_PLAN, seatLimit: String(DEFAULT_SEAT_LIMIT) },
    });
    organizationId = organization.id;
    try {
      await workos.userManagement.createOrganizationMembership({
        organizationId: organization.id,
        userId: session.user.id,
        roleSlug: "admin",
      });
    } catch (error) {
      // Don't leave an org nobody belongs to.
      await workos.organizations.deleteOrganization(organization.id).catch(() => {});
      throw error;
    }
  } catch (error) {
    console.error("[onboarding] failed to create organization", error);
    return {
      error:
        "Could not create the organization. Make sure the 'admin' role exists in your WorkOS environment (see documentation/auth.md).",
    };
  }

  await switchToOrganization(organizationId);
  redirect("/dashboard");
}
