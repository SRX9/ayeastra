import { Card } from "@heroui/react";
import { notFound } from "next/navigation";

import { SignalCard } from "@/components/intel/signal-card";
import { requireActiveSubscription } from "@/lib/auth";
import { getEntityDetail } from "@/lib/intel";

/** Entity detail (web-app doc): timeline · coverage · battlecard. Coverage
 * is the collection engine's transparency contract — exactly what is
 * watched, at what cadence, and when it was last checked. */

const DATE_TIME_FMT = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

interface BattlecardSection {
  content?: string;
  provenance?: string;
  updatedAt?: string;
}

export default async function EntityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireActiveSubscription();
  const { id } = await params;
  const detail = await getEntityDetail(session.organizationId, id);
  if (!detail) notFound();

  const battlecardSections = detail.battlecard
    ? Object.entries(detail.battlecard.sections as Record<string, BattlecardSection>)
    : [];

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">{detail.name}</h1>
        <p className="text-sm text-muted">
          {detail.domain ?? ""} · {detail.role} · {detail.tier} tier
        </p>
        {detail.description && (
          <p className="mt-1 text-sm text-muted">{detail.description}</p>
        )}
      </div>

      <h2 className="mb-2 text-base font-semibold">Coverage</h2>
      <Card className="mb-6">
        <Card.Content className="py-3">
          {detail.coverage.length === 0 ? (
            <p className="py-3 text-center text-sm text-muted">
              No sources watched yet for this entity.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1 pr-2 font-normal">Source</th>
                  <th className="py-1 pr-2 font-normal">Kind</th>
                  <th className="py-1 pr-2 font-normal">Cadence</th>
                  <th className="py-1 pr-2 font-normal">Health</th>
                  <th className="py-1 font-normal">Last change</th>
                </tr>
              </thead>
              <tbody>
                {detail.coverage.map((s) => (
                  <tr key={s.id} className="border-t border-neutral-200 dark:border-neutral-700">
                    <td className="max-w-[240px] truncate py-1.5 pr-2">
                      <a href={s.url} className="hover:underline" rel="noreferrer" target="_blank">
                        {s.url.replace(/^https?:\/\//, "")}
                      </a>
                    </td>
                    <td className="py-1.5 pr-2">{s.kind}</td>
                    <td className="py-1.5 pr-2">
                      {s.intervalMinutes ? `${Math.round(s.intervalMinutes / 60)}h` : "—"}
                    </td>
                    <td className="py-1.5 pr-2">
                      <span className={s.status === "ok" ? "text-green-600" : "text-orange-500"}>
                        {s.status}
                      </span>
                    </td>
                    <td className="py-1.5 text-muted">
                      {s.lastChangeAt ? DATE_TIME_FMT.format(s.lastChangeAt) : "none yet"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card.Content>
      </Card>

      <h2 className="mb-2 text-base font-semibold">Timeline</h2>
      {detail.signals.length === 0 ? (
        <Card className="mb-6">
          <Card.Content className="py-6 text-center text-sm text-muted">
            No signals yet — they appear when watched sources change.
          </Card.Content>
        </Card>
      ) : (
        <div className="mb-6">
          {detail.signals.map((signal) => (
            <SignalCard key={signal.id} signal={signal} />
          ))}
        </div>
      )}

      <h2 className="mb-2 text-base font-semibold">Battlecard</h2>
      {battlecardSections.length === 0 ? (
        <Card>
          <Card.Content className="py-6 text-center text-sm text-muted">
            No battlecard yet — it generates from the baseline crawl and
            refreshes as signals land.
          </Card.Content>
        </Card>
      ) : (
        <Card>
          <Card.Content className="space-y-4 py-4">
            {battlecardSections.map(([key, section]) => (
              <div key={key}>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-sm font-semibold capitalize">
                    {key.replaceAll("_", " ")}
                  </h3>
                  <span className="text-[11px] text-muted">
                    {section.provenance === "edited" ? "edited" : "auto"}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm">{section.content ?? ""}</p>
              </div>
            ))}
          </Card.Content>
        </Card>
      )}
    </div>
  );
}
