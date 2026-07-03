import type { BriefingAst, BriefingBlock } from "./ast";

/**
 * Email render target (briefing doc step 7): FULL content, not a teaser.
 * Deterministic, email-safe HTML (inline styles, no scripts, no external
 * CSS) + a plaintext twin — both required by the EmailProvider contract.
 */

function esc(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const S = {
  body: "margin:0;padding:24px;background:#f6f6f4;font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;",
  card: "max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e4e2dd;padding:32px;",
  h1: "font-size:22px;margin:0 0 4px;",
  meta: "font-size:13px;color:#6b6b66;margin:0 0 24px;",
  h2: "font-size:16px;margin:28px 0 10px;border-bottom:1px solid #e4e2dd;padding-bottom:6px;",
  h3: "font-size:14px;margin:14px 0 4px;",
  p: "font-size:14px;line-height:1.55;margin:0 0 10px;",
  cite: "font-size:12px;color:#6b6b66;text-decoration:none;",
  owner: "font-size:12px;color:#6b6b66;",
  quiet:
    "font-size:13px;background:#f2f1ec;border:1px solid #e4e2dd;padding:10px 14px;margin:0 0 20px;",
  footer: "font-size:12px;color:#6b6b66;margin-top:28px;",
};

function citationLinks(ast: BriefingAst, refs: string[]): string {
  const parts = refs.map((ref) => {
    const c = ast.citations[ref];
    const label = esc(ref);
    return c?.sourceUrl
      ? `<a href="${esc(c.sourceUrl)}" style="${S.cite}">[${label}]</a>`
      : `<span style="${S.cite}">[${label}]</span>`;
  });
  return parts.length ? ` ${parts.join(" ")}` : "";
}

function blockHtml(ast: BriefingAst, block: BriefingBlock): string {
  const heading = block.heading
    ? `<h3 style="${S.h3}">${esc(block.heading)}</h3>`
    : "";
  const owner = block.ownerRole
    ? ` <span style="${S.owner}">— suggested owner: ${esc(block.ownerRole)}</span>`
    : "";
  return `${heading}<p style="${S.p}">${esc(block.text)}${citationLinks(ast, block.refs)}${owner}</p>`;
}

export function renderEmailHtml(ast: BriefingAst): string {
  const quiet = ast.quietWeek
    ? `<p style="${S.quiet}">Quiet week: coverage ran as usual and little moved. What follows is everything worth your time — nothing padded.</p>`
    : "";
  const sections = ast.sections
    .map(
      (section) =>
        `<h2 style="${S.h2}">${esc(section.title)}</h2>` +
        section.blocks.map((b) => blockHtml(ast, b)).join(""),
    )
    .join("");
  return `<!doctype html><html><body style="${S.body}"><div style="${S.card}">
<h1 style="${S.h1}">Competitive Briefing</h1>
<p style="${S.meta}">${esc(ast.orgName)} · ${esc(ast.periodLabel)}</p>
${quiet}${sections}
<p style="${S.footer}"><a href="${esc(ast.webUrl)}" style="${S.cite}">Open in AyeAstra</a> — evidence links, feedback, and history live there.</p>
</div></body></html>`;
}

export function renderEmailText(ast: BriefingAst): string {
  const lines: string[] = [
    `COMPETITIVE BRIEFING — ${ast.orgName} — ${ast.periodLabel}`,
  ];
  if (ast.quietWeek) {
    lines.push("", "Quiet week: coverage ran as usual and little moved.");
  }
  for (const section of ast.sections) {
    lines.push("", section.title.toUpperCase(), "");
    for (const b of section.blocks) {
      const refs = b.refs.length ? ` [${b.refs.join(", ")}]` : "";
      const owner = b.ownerRole ? ` (owner: ${b.ownerRole})` : "";
      lines.push(`${b.heading ? `${b.heading}: ` : ""}${b.text}${refs}${owner}`);
    }
  }
  lines.push("", `Full briefing: ${ast.webUrl}`);
  return lines.join("\n");
}
