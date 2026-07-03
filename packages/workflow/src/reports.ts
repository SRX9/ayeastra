import { signalCategory } from "@ayeastra/db";
import { z } from "zod";

/**
 * Reports builder (3.2): composable blocks over the EXISTING object model.
 * A report is a curated view — never new unevidenced prose. Every rendered
 * line carries its evidence chip; the web/lib layer fetches block data via
 * scopedDb, this module owns the schema and the deterministic renderers.
 */

const days = z.number().int().min(7).max(365).default(90);
const limit = z.number().int().min(1).max(20).default(6);

export const reportBlockSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("entity_timeline"), entityId: z.uuid(), days }),
  z.object({ kind: z.literal("diff_gallery"), entityId: z.uuid(), limit }),
  z.object({
    kind: z.literal("signal_digest"),
    categories: z.array(z.enum(signalCategory.enumValues)).min(1),
    days,
    limit,
  }),
  z.object({ kind: z.literal("pricing_history"), entityId: z.uuid(), limit }),
  z.object({
    kind: z.literal("battlecard_excerpt"),
    entityId: z.uuid(),
    sectionKey: z.string().min(1),
  }),
  z.object({ kind: z.literal("insight_block"), limit }),
]);
export type ReportBlock = z.output<typeof reportBlockSchema>;

export const reportLayoutSchema = z.object({
  v: z.literal(1),
  blocks: z.array(reportBlockSchema).min(1).max(12),
});
export type ReportLayout = z.output<typeof reportLayoutSchema>;

export class ReportLayoutError extends Error {
  constructor(issues: string) {
    super(`invalid report layout: ${issues}`);
    this.name = "ReportLayoutError";
  }
}

/** jsonb is never trusted — parse on every read. */
export function parseReportLayout(raw: unknown): ReportLayout {
  const r = reportLayoutSchema.safeParse(raw);
  if (!r.success) throw new ReportLayoutError(r.error.message);
  return r.data;
}

export const REPORT_BLOCK_TITLES: Record<ReportBlock["kind"], string> = {
  entity_timeline: "Timeline",
  diff_gallery: "Change gallery",
  signal_digest: "Signal digest",
  pricing_history: "Pricing history",
  battlecard_excerpt: "Battlecard excerpt",
  insight_block: "Connected intelligence",
};

/** One fetched block, ready to render: lines with their evidence chips. */
export interface RenderedReportBlock {
  title: string;
  lines: Array<{ text: string; evidenceId: string | null }>;
}

/**
 * Markdown export — deterministic; evidence chips become links so the
 * export never sheds its provenance.
 */
export function renderReportMarkdown(input: {
  title: string;
  generatedAt: string; // ISO date
  blocks: RenderedReportBlock[];
  evidenceBaseUrl: string; // e.g. https://app.example.com/evidence
}): string {
  const lines: string[] = [`# ${input.title}`, "", `_Generated ${input.generatedAt}_`];
  for (const block of input.blocks) {
    lines.push("", `## ${block.title}`, "");
    if (block.lines.length === 0) {
      lines.push("_Nothing in this window._");
      continue;
    }
    for (const l of block.lines) {
      const chip = l.evidenceId
        ? ` ([evidence](${input.evidenceBaseUrl}/${l.evidenceId}))`
        : "";
      lines.push(`- ${l.text}${chip}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
