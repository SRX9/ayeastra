import { renderReportMarkdown } from "@ayeastra/workflow";

import { fetchReportBlocks, getReport, requireWorkflow } from "@/lib/workflow";

/** Markdown export — provenance travels with the file (evidence links). */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireWorkflow();
  const { id } = await params;
  const report = await getReport(session.organizationId, id);
  if (!report) return new Response("Not found", { status: 404 });

  const blocks = await fetchReportBlocks(session.organizationId, report.layout);
  const markdown = renderReportMarkdown({
    title: report.title,
    generatedAt: new Date().toISOString().slice(0, 10),
    blocks,
    evidenceBaseUrl: `${new URL(request.url).origin}/evidence`,
  });

  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${report.title.replace(/[^\w-]+/g, "-")}.md"`,
    },
  });
}
