import Link from "next/link";

import { osButton, osModule } from "@/components/os/ui";
import { requireActiveSubscription } from "@/lib/auth";
import { listBriefings } from "@/lib/intel";

const PERIOD_FMT = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatPeriod(start: string, end: string): string {
  return `${PERIOD_FMT.format(new Date(start))} – ${PERIOD_FMT.format(new Date(end))}`;
}

export default async function BriefingsPage() {
  const session = await requireActiveSubscription();
  const rows = await listBriefings(session.organizationId);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-medium">Briefings</h1>
        {/* Reports and Board Mode are sibling document surfaces — reachable
            here and via the command palette; they don't get dock slots. */}
        <span className="flex gap-2">
          <Link href="/reports" className={`${osButton} no-underline`}>
            Reports
          </Link>
          <Link href="/board" className={`${osButton} no-underline`}>
            Board Mode
          </Link>
        </span>
      </div>

      {rows.length === 0 ? (
        <div className={osModule}>
          <div className="px-6 py-10 text-center text-sm text-muted">
            Your Baseline Dossier lands within 24 hours of activation; weekly
            briefings arrive Monday mornings after that.
          </div>
        </div>
      ) : (
        <div className={`${osModule} divide-y divide-border`}>
          {rows.map((b) => (
            <Link
              key={b.id}
              href={`/briefings/${b.id}`}
              className="flex items-baseline justify-between px-4 py-3 no-underline transition-colors hover:bg-surface-secondary"
            >
              <span className="text-sm font-medium capitalize text-foreground">
                {b.kind} briefing
              </span>
              <span className="font-mono text-xs tabular-nums text-muted">
                {formatPeriod(b.periodStart, b.periodEnd)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
