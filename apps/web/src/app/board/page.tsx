import { Card } from "@heroui/react";
import Link from "next/link";

import type { BriefingAst } from "@ayeastra/briefing";

import { getLatestBoard, requireWorkflow } from "@/lib/workflow";

/** Board Mode (3.2): the quarterly executive artifact. Print-friendly —
 * the browser's print-to-PDF is the boardroom export (buy-don't-build). */

export default async function BoardPage() {
  const session = await requireWorkflow();
  const board = await getLatestBoard(session.organizationId);

  if (!board?.sections) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Board Mode</h1>
        <p className="mt-4 text-sm text-muted">
          No quarterly artifact yet — it assembles automatically at quarter end
          from a quarter of evidence: landscape shifts, strategic highlights,
          actions and outcomes, validated-pattern outlook, and coverage.
        </p>
      </div>
    );
  }

  const ast = board.sections as unknown as BriefingAst;
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Board Mode</h1>
        <p className="text-sm text-muted">
          {ast.orgName} · {ast.periodLabel}
        </p>
      </div>

      {ast.sections.map((section) => (
        <Card key={section.key} className="mb-4 print:border-0 print:shadow-none">
          <Card.Header>
            <Card.Title>{section.title}</Card.Title>
          </Card.Header>
          <Card.Content className="space-y-3">
            {section.blocks.map((block) => (
              <div key={`${block.heading ?? ""}:${block.text}`}>
                {block.heading && (
                  <h3 className="text-sm font-semibold">{block.heading}</h3>
                )}
                <p className="text-sm">
                  {block.text}
                  {block.refs.map((ref) => {
                    const citation = ast.citations[ref];
                    return citation ? (
                      <Link
                        key={ref}
                        href={`/evidence/${citation.evidenceId}`}
                        className="ml-1 rounded bg-neutral-100 px-1 py-0.5 font-mono text-[10px] text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"
                      >
                        {ref}
                      </Link>
                    ) : null;
                  })}
                </p>
              </div>
            ))}
          </Card.Content>
        </Card>
      ))}
    </div>
  );
}
