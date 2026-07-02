import { Alert, Card } from "@heroui/react";
import Link from "next/link";

import { getOrganization, requireActiveSubscription } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await requireActiveSubscription();
  const organization = await getOrganization(session.organizationId);

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      {session.billing.pastDue && (
        <Alert status="danger" className="mb-6">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              Your last payment failed — access continues while Stripe retries.{" "}
              <Link href="/settings/billing" className="link underline underline-offset-4">
                Update your payment method
              </Link>
              .
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <div className="mb-6">
        <h1 className="text-xl font-semibold">{organization.name}</h1>
        <p className="text-sm text-muted">
          Welcome back{session.user.firstName ? `, ${session.user.firstName}` : ""} — signed in as{" "}
          {session.role ?? "member"}.
        </p>
      </div>

      <Card>
        <Card.Header>
          <Card.Title>Briefings</Card.Title>
        </Card.Header>
        <Card.Content>
          <p className="text-sm text-muted">
            Nothing here yet — competitive briefings will land on this page. Meanwhile you can{" "}
            <Link href="/settings/team" className="link underline underline-offset-4">
              invite your team
            </Link>
            .
          </p>
        </Card.Content>
      </Card>
    </div>
  );
}
