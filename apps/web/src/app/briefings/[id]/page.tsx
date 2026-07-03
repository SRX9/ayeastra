import { Card } from "@heroui/react";
import Link from "next/link";
import { notFound } from "next/navigation";

import type { BriefingAst } from "@ayeastra/briefing";

import { submitFeedback } from "@/app/dashboard/actions";
import { requireActiveSubscription } from "@/lib/auth";
import { getBriefing } from "@/lib/intel";

/** The briefing reader: section AST → React, evidence chips inline,
 * per-section feedback, print-friendly (boards get PDFs). */

const feedbackButton =
  "rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800 print:hidden";

export default async function BriefingReaderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireActiveSubscription();
  const { id } = await params;
  const briefing = await getBriefing(session.organizationId, id);
  if (!briefing?.sections) notFound();

  const ast = briefing.sections as unknown as BriefingAst;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Competitive Briefing</h1>
        <p className="text-sm text-muted">
          {ast.orgName} · {ast.periodLabel}
        </p>
        {ast.quietWeek && (
          <p className="mt-2 rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-muted dark:border-neutral-700 dark:bg-neutral-900">
            Quiet week: coverage ran as usual and little moved — nothing here is
            padded.
          </p>
        )}
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
                {block.ownerRole && (
                  <p className="text-xs text-muted">
                    suggested owner: {block.ownerRole}
                  </p>
                )}
              </div>
            ))}
            <form action={submitFeedback} className="flex justify-end gap-1.5 pt-1">
              <input type="hidden" name="targetType" value="briefing_section" />
              <input type="hidden" name="targetId" value={`${briefing.id}:${section.key}`} />
              <button type="submit" name="verdict" value="useful" className={feedbackButton}>
                Useful
              </button>
              <button type="submit" name="verdict" value="not_useful" className={feedbackButton}>
                Not useful
              </button>
              <button type="submit" name="verdict" value="wrong" className={feedbackButton}>
                Wrong
              </button>
            </form>
          </Card.Content>
        </Card>
      ))}
    </div>
  );
}
