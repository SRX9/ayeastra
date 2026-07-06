import { notFound } from "next/navigation";

import {
  costPerOrgDay,
  costPerSourceDay,
  costPerTaskDay,
  orgActionMetrics,
  orgCostAnomalies,
} from "@ayeastra/db";

import { requireAuth } from "@/lib/auth";

/**
 * Internal margin/COGS dashboard (observability doc): plain tables, no
 * design budget. Env-gated allowlist — ADMIN_EMAILS is a comma-separated
 * list; unlisted users get a 404, not a login hint.
 */

const USD_FMT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 4,
});

const DAY_MS = 24 * 60 * 60 * 1000;

/** Request-time query windows (server component — computed per request). */
function costWindows() {
  const now = Date.now();
  return {
    from: new Date(now - 14 * DAY_MS),
    to: new Date(now + DAY_MS),
    yesterday: new Date(new Date(now - DAY_MS).toISOString().slice(0, 10)),
  };
}

// Parsed once — env doesn't change per request.
const ADMIN_EMAILS = new Set<string>();
for (const e of (process.env.ADMIN_EMAILS ?? "").split(",")) {
  const email = e.trim().toLowerCase();
  if (email) ADMIN_EMAILS.add(email);
}

function CostTable({ title, rows }: { title: string; rows: Array<{ day: string; key: string | null; costUsd: number }> }) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-base font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No cost events in window.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-1 pr-2 font-normal">Day</th>
              <th className="py-1 pr-2 font-normal">Key</th>
              <th className="py-1 text-right font-normal">Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 30).map((r) => (
              <tr key={`${r.day}:${r.key}`} className="border-t border-border">
                <td className="py-1 pr-2">{r.day}</td>
                <td className="max-w-[320px] truncate py-1 pr-2 font-mono text-xs">{r.key ?? "(shared)"}</td>
                <td className="py-1 text-right font-mono">{USD_FMT.format(r.costUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default async function AdminPage() {
  const session = await requireAuth();
  if (!ADMIN_EMAILS.has(session.user.email.toLowerCase())) notFound();

  const { from, to, yesterday } = costWindows();
  // Outcome metrics run on a 30-day window (actions/org/month is the PRD unit).
  const actionsFrom = new Date(to.getTime() - 31 * DAY_MS);
  const [byOrg, byTask, bySource, anomalies, actionMetrics] = await Promise.all([
    costPerOrgDay(from, to),
    costPerTaskDay(from, to),
    costPerSourceDay(from, to),
    orgCostAnomalies(yesterday),
    orgActionMetrics(actionsFrom, to),
  ]);

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-1 text-xl font-semibold">Cost telemetry</h1>
      <p className="mb-6 text-sm text-muted">
        Last 14 days from cost_events. Global-layer spend shows as (shared) —
        apportioned across watching orgs for per-customer COGS.
      </p>

      {anomalies.length > 0 && (
        <section className="mb-8 rounded border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
          <h2 className="mb-1 text-base font-semibold">
            Anomalies yesterday (&gt;3× trailing mean)
          </h2>
          {anomalies.map((a) => (
            <p key={a.workosOrgId} className="font-mono text-sm">
              {a.workosOrgId}: {USD_FMT.format(a.dayUsd)} vs mean{" "}
              {USD_FMT.format(a.trailingMeanUsd)}
            </p>
          ))}
        </section>
      )}

      <CostTable title="Cost per org / day" rows={byOrg} />
      <CostTable title="Cost per task / day" rows={byTask} />
      <CostTable title="Cost per source / day" rows={bySource} />

      <section className="mb-8">
        <h2 className="mb-2 text-base font-semibold">
          Outcome tracking (last 30 days)
        </h2>
        <p className="mb-2 text-xs text-muted">
          PRD targets: action rate &gt; 30% of briefings; outcome-attached %
          trends the renewal story.
        </p>
        {actionMetrics.length === 0 ? (
          <p className="text-sm text-muted">No actions in window.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 pr-2 font-normal">Org</th>
                <th className="py-1 pr-2 text-right font-normal">Actions</th>
                <th className="py-1 pr-2 text-right font-normal">Open</th>
                <th className="py-1 pr-2 text-right font-normal">Done</th>
                <th className="py-1 pr-2 text-right font-normal">Outcome %</th>
                <th className="py-1 text-right font-normal">Briefing action rate</th>
              </tr>
            </thead>
            <tbody>
              {actionMetrics.map((m) => (
                <tr key={m.workosOrgId} className="border-t border-border">
                  <td className="max-w-60 truncate py-1 pr-2 font-mono text-xs">{m.workosOrgId}</td>
                  <td className="py-1 pr-2 text-right font-mono">{m.actionsCreated}</td>
                  <td className="py-1 pr-2 text-right font-mono">{m.openActions}</td>
                  <td className="py-1 pr-2 text-right font-mono">{m.doneActions}</td>
                  <td className="py-1 pr-2 text-right font-mono">{m.outcomeAttachedPct}%</td>
                  <td className="py-1 text-right font-mono">{m.briefingActionRatePct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
