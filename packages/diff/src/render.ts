import type { BlockDiff } from "./patience";

/**
 * The side-by-side HTML artifact persisted to R2 (`diff_r2_key`) — the exact
 * thing users screenshot and forward (diff doc). Self-contained: inline CSS,
 * no external requests, renders anywhere.
 */

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cell(text: string | null, cls: string): string {
  return text === null
    ? `<td class="empty"></td>`
    : `<td class="${cls}"><pre>${esc(text)}</pre></td>`;
}

export interface RenderMeta {
  sourceUrl: string;
  beforeAt: Date;
  afterAt: Date;
}

export function renderDiffHtml(diff: BlockDiff, meta: RenderMeta): string {
  const rows: string[] = [];
  for (const m of diff.modified) {
    rows.push(`<tr>${cell(m.before, "removed")}${cell(m.after, "added")}</tr>`);
  }
  for (const r of diff.removed) {
    rows.push(`<tr>${cell(r, "removed")}${cell(null, "")}</tr>`);
  }
  for (const a of diff.added) {
    rows.push(`<tr>${cell(null, "")}${cell(a, "added")}</tr>`);
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Change — ${esc(meta.sourceUrl)}</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 24px; color: #111; }
  .meta { color: #555; font-size: 13px; margin-bottom: 16px; }
  .meta a { color: inherit; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  th { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: .04em;
       color: #666; padding: 6px 10px; border-bottom: 2px solid #ddd; width: 50%; }
  td { vertical-align: top; padding: 6px 10px; border-bottom: 1px solid #eee; }
  pre { margin: 0; white-space: pre-wrap; word-break: break-word; font: 13px/1.5 ui-monospace, monospace; }
  .removed { background: #fff1f0; }
  .removed pre { text-decoration: line-through; text-decoration-color: #d4380d55; }
  .added { background: #f0fff4; }
  .empty { background: #fafafa; }
  footer { margin-top: 16px; color: #888; font-size: 12px; }
</style>
</head>
<body>
<div class="meta">
  <strong>${esc(meta.sourceUrl)}</strong><br>
  before: ${meta.beforeAt.toISOString()} · after: ${meta.afterAt.toISOString()}
</div>
<table>
  <tr><th>Before</th><th>After</th></tr>
  ${rows.join("\n  ")}
</table>
<footer>Captured and diffed by AyeAstra · ${diff.unchangedCount} unchanged blocks omitted</footer>
</body>
</html>`;
}
