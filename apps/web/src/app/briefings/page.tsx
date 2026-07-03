import { Card } from "@heroui/react";
import Link from "next/link";

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
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-4 text-xl font-semibold">Briefings</h1>
      {rows.length === 0 ? (
        <Card>
          <Card.Content className="py-8 text-center text-sm text-muted">
            Your Baseline Dossier lands within 24 hours of activation; weekly
            briefings arrive Monday mornings after that.
          </Card.Content>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((b) => (
            <Link key={b.id} href={`/briefings/${b.id}`} className="block">
              <Card className="transition hover:shadow-md">
                <Card.Content className="flex items-baseline justify-between py-3">
                  <span className="text-sm font-medium capitalize">
                    {b.kind} briefing
                  </span>
                  <span className="text-xs text-muted">
                    {formatPeriod(b.periodStart, b.periodEnd)}
                  </span>
                </Card.Content>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
