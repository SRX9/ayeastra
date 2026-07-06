import Link from "next/link";

import type { BriefingAst } from "@ayeastra/briefing";

import { Window } from "@/components/os/window";
import { getLatestBoard, requireWorkflow } from "@/lib/workflow";

/** Board Mode (3.2): the quarterly executive artifact. Print-friendly —
 * the browser's print-to-PDF is the boardroom export (buy-don't-build). */

export default async function BoardPage() {
  const session = await requireWorkflow();
  const board = await getLatestBoard(session.organizationId);

  if (!board?.sections) {
    return (
      <Window title="Board Mode" closeHref="/briefings">
        <p className="text-sm text-muted">
          No quarterly artifact yet — it assembles automatically at quarter end
          from a quarter of evidence: landscape shifts, strategic highlights,
          actions and outcomes, validated-pattern outlook, and coverage.
        </p>
      </Window>
    );
  }

  const ast = board.sections as unknown as BriefingAst;
  return (
    <Window title="Board Mode" meta={ast.periodLabel} closeHref="/briefings">
      <div className="space-y-6">
        <p className="font-mono text-xs text-muted">{ast.orgName}</p>

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
              </div>
            ))}
          </section>
        ))}
      </div>
    </Window>
  );
}
