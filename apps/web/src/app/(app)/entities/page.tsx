import Link from "next/link";

import { osModule } from "@/components/os/ui";
import { requireActiveSubscription } from "@/lib/auth";
import { listWatchedEntities } from "@/lib/intel";

export default async function EntitiesPage() {
  const session = await requireActiveSubscription();
  const watched = await listWatchedEntities(session.organizationId);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-medium">Entities</h1>
        <span className="font-mono text-xs tabular-nums text-muted">
          {watched.length} watched
        </span>
      </div>

      {watched.length === 0 ? (
        <div className={osModule}>
          <div className="px-6 py-10 text-center text-sm text-muted">
            No entities watched yet — competitors get added during onboarding,
            or ask us to widen coverage.
          </div>
        </div>
      ) : (
        <div className={`${osModule} divide-y divide-border`}>
          {watched.map((e) => (
            <Link
              key={e.entityId}
              href={`/entities/${e.entityId}`}
              className="flex items-baseline gap-3 px-4 py-3 no-underline transition-colors hover:bg-surface-secondary"
            >
              <span className="text-sm font-medium text-foreground">{e.name}</span>
              {e.domain && (
                <span className="truncate font-mono text-xs text-muted">{e.domain}</span>
              )}
              <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-muted">
                {e.role} · {e.tier} · {e.signalCount} signals
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
