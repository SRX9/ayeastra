import { Card } from "@heroui/react";
import { redirect } from "next/navigation";

import { requireAuth } from "@/lib/auth";

import { CreateOrgForm } from "./create-org-form";

export default async function OnboardingPage() {
  const session = await requireAuth();
  if (session.organizationId) redirect("/dashboard");

  return (
    <div className="container mx-auto flex max-w-md flex-col justify-center px-4 py-12">
      <Card>
        <Card.Header>
          <Card.Title>Create your organization</Card.Title>
          <Card.Description>
            Signed in as {session.user.email}. Set up your workspace to get started — you can invite
            your team right after.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <CreateOrgForm />
        </Card.Content>
      </Card>
    </div>
  );
}
