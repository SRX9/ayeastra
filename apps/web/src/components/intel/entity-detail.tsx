import { SignalCard } from "@/components/intel/signal-card";
import { osModule } from "@/components/os/ui";
import type { getEntityDetail } from "@/lib/intel";

/** Entity detail body (web-app doc): timeline · coverage · battlecard.
 * Extracted from the page so the overlay window (Phase 4) renders the same
 * content. Coverage is the collection engine's transparency contract. */

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

export type EntityDetailData = NonNullable<Awaited<ReturnType<typeof getEntityDetail>>>;

export function EntityDetail({ detail }: { detail: EntityDetailData }) {
  const battlecardSections = detail.battlecard
    ? Object.entries(detail.battlecard.sections as Record<string, BattlecardSection>)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs text-muted">
          {detail.domain ?? ""} · {detail.role} · {detail.tier} tier
        </p>
        {detail.description && (
          <p className="mt-1 text-sm text-muted">{detail.description}</p>
        )}
      </div>

      <section>
        <h2 className="mb-2 font-mono text-xs tracking-wide text-muted">Coverage</h2>
        <div className={osModule}>
          {detail.coverage.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">
              No sources watched yet for this entity.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left font-mono text-xs text-muted">
                  <th className="px-4 py-2 font-normal">Source</th>
                  <th className="py-2 pr-2 font-normal">Kind</th>
                  <th className="py-2 pr-2 font-normal">Cadence</th>
                  <th className="py-2 pr-2 font-normal">Health</th>
                  <th className="py-2 pr-4 font-normal">Last change</th>
                </tr>
              </thead>
              <tbody>
                {detail.coverage.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="max-w-[240px] truncate px-4 py-1.5">
                      <a
                        href={s.url}
                        className="no-underline hover:underline"
                        rel="noreferrer"
                        target="_blank"
                      >
                        {s.url.replace(/^https?:\/\//, "")}
                      </a>
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-xs">{s.kind}</td>
                    <td className="py-1.5 pr-2 font-mono text-xs tabular-nums">
                      {s.intervalMinutes ? `${Math.round(s.intervalMinutes / 60)}h` : "—"}
                    </td>
                    <td className="py-1.5 pr-2">
                      <span
                        className={`font-mono text-xs ${s.status === "ok" ? "text-success" : "text-warning"}`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="py-1.5 pr-4 font-mono text-xs tabular-nums text-muted">
                      {s.lastChangeAt ? DATE_TIME_FMT.format(s.lastChangeAt) : "none yet"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-mono text-xs tracking-wide text-muted">Timeline</h2>
        {detail.signals.length === 0 ? (
          <div className={osModule}>
            <p className="px-4 py-6 text-center text-sm text-muted">
              No signals yet — they appear when watched sources change.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {detail.signals.map((signal) => (
              <SignalCard key={signal.id} signal={signal} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-mono text-xs tracking-wide text-muted">Battlecard</h2>
        <div className={osModule}>
          {battlecardSections.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">
              No battlecard yet — it generates from the baseline crawl and
              refreshes as signals land.
            </p>
          ) : (
            <div className="space-y-4 px-4 py-4">
              {battlecardSections.map(([key, section]) => (
                <div key={key}>
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-sm font-medium capitalize">
                      {key.replaceAll("_", " ")}
                    </h3>
                    <span className="font-mono text-[11px] text-muted">
                      {section.provenance === "edited" ? "edited" : "auto"}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-muted">
                    {section.content ?? ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
