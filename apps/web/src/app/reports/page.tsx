import { Card } from "@heroui/react";
import Link from "next/link";

import { listWatchedEntities } from "@/lib/intel";
import { listReports, requireWorkflow } from "@/lib/workflow";

import { createReport } from "../missions/actions";

/** Reports builder (3.2): composable blocks over the existing object model.
 * A report is a curated view — every block keeps its evidence chips. */

const inputClass =
  "w-full rounded border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-600";

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
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Reports</h1>

      <Card className="mb-6">
        <Card.Header>
          <Card.Title>New report</Card.Title>
          <Card.Description>
            Composable blocks: entity_timeline · diff_gallery · signal_digest ·
            pricing_history · battlecard_excerpt · insight_block.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <form action={createReport} className="space-y-3">
            <input name="title" required placeholder="Report title" className={inputClass} />
            <textarea
              name="layout"
              rows={10}
              defaultValue={defaultLayout}
              className={`${inputClass} font-mono text-xs`}
            />
            <button
              type="submit"
              className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900"
            >
              Save report
            </button>
          </form>
        </Card.Content>
      </Card>

      {reports.length === 0 ? (
        <p className="text-sm text-muted">No saved reports.</p>
      ) : (
        reports.map((r) => (
          <Card key={r.id} className="mb-3">
            <Card.Content className="flex items-center justify-between py-4">
              <Link href={`/reports/${r.id}`} className="font-medium hover:underline">
                {r.title}
              </Link>
              <span className="text-xs text-muted">
                updated {r.updatedAt.toISOString().slice(0, 10)}
              </span>
            </Card.Content>
          </Card>
        ))
      )}
    </div>
  );
}
