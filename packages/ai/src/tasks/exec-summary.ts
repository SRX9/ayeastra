import { z } from "zod";

import { ANALYST_TONE } from "../rubrics";
import { defineTask } from "../task";

/**
 * Briefing step 4: the executive summary is written LAST, from the finished
 * sections — it summarizes the briefing, not the week. Bullets cite refs
 * already validated by their sections, so the citation chain stays intact.
 */

export const ExecSummaryInput = z.object({
  periodLabel: z.string(),
  sections: z
    .array(
      z.object({
        key: z.string(),
        blocks: z.array(
          z.object({ text: z.string(), refs: z.array(z.string()) }),
        ),
      }),
    )
    .min(1),
});

export const ExecSummaryOutput = z.object({
  bullets: z
    .array(z.object({ text: z.string().min(1), refs: z.array(z.string()).min(1) }))
    .min(3)
    .max(5),
});

export const execSummary = defineTask({
  name: "exec-summary",
  tier: "heavy",
  input: ExecSummaryInput,
  output: ExecSummaryOutput,
  maxOutputTokens: 500,
  prompt: (input) => ({
    system: `You write the executive summary of a competitive briefing from its FINISHED sections.
${ANALYST_TONE}
Rules:
- 3-5 bullets, most consequential first, each standing alone for a CEO skimming on mobile.
- Summarize ONLY what the sections say; carry over each bullet's supporting refs from the blocks it summarizes.
- No new claims, no new numbers, no advice not already in the sections.`,
    user: JSON.stringify(input),
  }),
  validate: (out, input) => {
    const known = new Set(
      input.sections.flatMap((s) => s.blocks.flatMap((b) => b.refs)),
    );
    const issues: string[] = [];
    for (const [i, bullet] of out.bullets.entries()) {
      for (const ref of bullet.refs) {
        if (!known.has(ref)) {
          issues.push(
            `bullet ${i + 1}: cites ${ref}, which no section block carries`,
          );
        }
      }
    }
    return issues;
  },
});
