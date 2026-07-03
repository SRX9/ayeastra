import { Card } from "@heroui/react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { fetchReportBlocks, getReport, requireWorkflow } from "@/lib/workflow";

/** Report reader: curated blocks, every line with its evidence chip. */

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireWorkflow();
  const { id } = await params;
  const report = await getReport(session.organizationId, id);
  if (!report) notFound();
  const blocks = await fetchReportBlocks(session.organizationId, report.layout);

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{report.title}</h1>
        <Link
          href={`/reports/${report.id}/markdown`}
          className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 print:hidden"
        >
          Export markdown
        </Link>
      </div>

      {blocks.map((block, i) => (
        <Card key={`${block.title}-${i}`} className="mb-4 print:border-0 print:shadow-none">
          <Card.Header>
            <Card.Title>{block.title}</Card.Title>
          </Card.Header>
          <Card.Content className="space-y-2 text-sm">
            {block.lines.length === 0 && (
              <p className="text-muted">Nothing in this window.</p>
            )}
            {block.lines.map((line) => (
              <p key={line.text}>
                {line.text}
                {line.evidenceId && (
                  <Link
                    href={`/evidence/${line.evidenceId}`}
                    className="ml-1 rounded bg-neutral-100 px-1 py-0.5 font-mono text-[10px] text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"
                  >
                    evidence
                  </Link>
                )}
              </p>
            ))}
          </Card.Content>
        </Card>
      ))}
    </div>
  );
}
