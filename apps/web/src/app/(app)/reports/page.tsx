import Link from "next/link";

import { osButtonPrimary, osInput, osModule } from "@/components/os/ui";
import { listWatchedEntities } from "@/lib/intel";
import { listReports, requireWorkflow } from "@/lib/workflow";

import { createReport } from "../missions/actions";

/** Reports builder (3.2): composable blocks over the existing object model.
 * A report is a curated view — every block keeps its evidence chips. */

export default async function ReportsPage() {
  const session = await requireWorkflow();
  const [reports, watched] = await Promise.all([
    listReports(session.organizationId),
    listWatchedEntities(session.organizationId),
  ]);

  const defaultLayout = JSON.stringify(
    {
      v: 1,
      blocks: [
        { kind: "signal_digest", categories: ["pricing", "launch", "messaging"], days: 30, limit: 8 },
        ...(watched[0] ? [{ kind: "entity_timeline", entityId: watched[0].entityId, days: 90 }] : []),
        { kind: "insight_block", limit: 3 },
      ],
    },
    null,
    2,
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-medium">Reports</h1>
        <span className="font-mono text-xs tabular-nums text-muted">
          {reports.length} saved
        </span>
      </div>

      <details className={osModule} open={reports.length === 0}>
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span className="font-mono text-xs tracking-wide text-foreground">New Report</span>
          <span className="text-xs text-muted">composable blocks with evidence chips</span>
        </summary>
        <div className="border-t border-border px-4 py-4">
          <p className="mb-3 text-xs text-muted">
            Blocks: entity_timeline · diff_gallery · signal_digest · pricing_history ·
            battlecard_excerpt · insight_block.
          </p>
          <form action={createReport} className="space-y-3">
            <input
              name="title"
              required
              placeholder="Report title"
              className={`${osInput} w-full`}
            />
            <textarea
              name="layout"
              rows={10}
              defaultValue={defaultLayout}
              className={`${osInput} w-full font-mono text-xs`}
            />
            <button type="submit" className={osButtonPrimary}>
              Save report
            </button>
          </form>
        </div>
      </details>

      {reports.length === 0 ? (
        <p className="text-center text-sm text-muted">No saved reports.</p>
      ) : (
        <div className={`${osModule} divide-y divide-border`}>
          {reports.map((r) => (
            <Link
              key={r.id}
              href={`/reports/${r.id}`}
              className="flex items-baseline justify-between px-4 py-3 no-underline transition-colors hover:bg-surface-secondary"
            >
              <span className="text-sm font-medium text-foreground">{r.title}</span>
              <span className="font-mono text-xs tabular-nums text-muted">
                updated {r.updatedAt.toISOString().slice(0, 10)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
