import Link from "next/link";
import { notFound } from "next/navigation";

import { osButton } from "@/components/os/ui";
import { Window } from "@/components/os/window";
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
    <Window
      title={report.title}
      closeHref="/reports"
      meta={
        <Link
          href={`/reports/${report.id}/markdown`}
          className={`${osButton} no-underline print:hidden`}
        >
          Export markdown
        </Link>
      }
    >
      <div className="space-y-6">
        {blocks.map((block, i) => (
          <section key={`${block.title}-${i}`}>
            <h2 className="mb-2 font-mono text-xs tracking-wide text-muted">{block.title}</h2>
            <div className="space-y-2 text-sm">
              {block.lines.length === 0 && (
                <p className="text-muted">Nothing in this window.</p>
              )}
              {block.lines.map((line) => (
                <p key={line.text}>
                  {line.text}
                  {line.evidenceId && (
                    <Link
                      href={`/evidence/${line.evidenceId}`}
                      className="ml-1 rounded-md bg-default px-1.5 py-0.5 font-mono text-[10px] text-muted no-underline hover:text-foreground"
                    >
                      evidence
                    </Link>
                  )}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Window>
  );
}
