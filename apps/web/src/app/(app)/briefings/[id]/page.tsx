import Link from "next/link";
import { notFound } from "next/navigation";

import type { BriefingAst } from "@ayeastra/briefing";

import { createAction, submitFeedback } from "@/app/(app)/dashboard/actions";
import { osButton } from "@/components/os/ui";
import { Window } from "@/components/os/window";
import { requireActiveSubscription } from "@/lib/auth";
import { getBriefing } from "@/lib/intel";

/** The briefing reader: section AST → React, evidence chips inline,
 * per-section feedback, print-friendly (boards get PDFs). */

const feedbackButton = `${osButton} print:hidden`;

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
    <Window title="Competitive Briefing" meta={ast.periodLabel} closeHref="/briefings">
      <div className="space-y-6">
        <div>
          <p className="font-mono text-xs text-muted">{ast.orgName}</p>
          {ast.quietWeek && (
            <p className="mt-2 rounded-md border border-border bg-background-secondary px-3 py-2 text-sm text-muted">
              Quiet week: coverage ran as usual and little moved — nothing here is
              padded.
            </p>
          )}
        </div>

        {ast.sections.map((section) => (
          <section key={section.key} className="space-y-3 border-t border-border pt-4">
            <h2 className="font-mono text-xs tracking-wide text-muted">{section.title}</h2>
            {section.blocks.map((block) => (
              <div key={`${block.heading ?? ""}:${block.text}`}>
                {block.heading && (
                  <h3 className="text-sm font-medium">{block.heading}</h3>
                )}
                <p className="text-sm">
                  {block.text}
                  {block.refs.map((ref) => {
                    const citation = ast.citations[ref];
                    if (!citation) return null;
                    return citation.evidenceId ? (
                      <Link
                        key={ref}
                        href={`/evidence/${citation.evidenceId}`}
                        className="ml-1 rounded-md bg-default px-1.5 py-0.5 font-mono text-[10px] text-muted no-underline hover:text-foreground"
                      >
                        {ref}
                      </Link>
                    ) : (
                      <span
                        key={ref}
                        className="ml-1 rounded-md bg-default px-1.5 py-0.5 font-mono text-[10px] text-muted/60"
                      >
                        {ref}
                      </span>
                    );
                  })}
                </p>
                {block.ownerRole && (
                  <p className="text-xs text-muted">
                    suggested owner: {block.ownerRole}
                  </p>
                )}
                {section.key === "recommended_actions" && (
                  /* Outcome loop (2.2): briefing recommendation → tracked
                     action in one click, pre-filled from the block. */
                  <form action={createAction} className="pt-1 print:hidden">
                    <input type="hidden" name="sourceType" value="briefing" />
                    <input type="hidden" name="sourceId" value={briefing.id} />
                    <input type="hidden" name="description" value={block.text.slice(0, 500)} />
                    <button type="submit" className={feedbackButton}>
                      Track action
                    </button>
                  </form>
                )}
                {block.insightId && (
                  /* Fusion insights (3.1) carry their own feedback stream —
                     the >70% useful-rate acceptance metric reads these rows. */
                  <form action={submitFeedback} className="flex gap-1.5 pt-1 print:hidden">
                    <input type="hidden" name="targetType" value="insight" />
                    <input type="hidden" name="targetId" value={block.insightId} />
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
                )}
              </div>
            ))}
            <form action={submitFeedback} className="flex justify-end gap-1.5 pt-1 print:hidden">
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
          </section>
        ))}
      </div>
    </Window>
  );
}
