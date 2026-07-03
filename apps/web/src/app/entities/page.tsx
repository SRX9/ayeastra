import { Card } from "@heroui/react";
import Link from "next/link";

import { requireActiveSubscription } from "@/lib/auth";
import { listWatchedEntities } from "@/lib/intel";

export default async function EntitiesPage() {
  const session = await requireActiveSubscription();
  const watched = await listWatchedEntities(session.organizationId);

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-4 text-xl font-semibold">Watched entities</h1>
      {watched.length === 0 ? (
        <Card>
          <Card.Content className="py-8 text-center text-sm text-muted">
            No entities watched yet — competitors get added during onboarding,
            or ask us to widen coverage.
          </Card.Content>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {watched.map((e) => (
            <Link key={e.entityId} href={`/entities/${e.entityId}`}>
              <Card className="h-full transition hover:shadow-md">
                <Card.Content className="space-y-1 py-4">
                  <div className="flex items-baseline justify-between">
                    <span className="font-semibold">{e.name}</span>
                    <span className="text-[11px] uppercase text-muted">
                      {e.tier}
                    </span>
                  </div>
                  {e.domain && (
                    <p className="text-xs text-muted">{e.domain}</p>
                  )}
                  <p className="text-xs text-muted">
                    {e.role} · {e.signalCount} signals
                  </p>
                </Card.Content>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
