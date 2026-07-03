import type { BriefingAst } from "./ast";

/**
 * Slack render target (briefing doc step 7): a DIGEST — exec summary + top
 * moves + link to the full briefing. Never the whole thing; Slack is the
 * hook, the web reader is the artifact.
 */

/** Slack hard limit is 3000 chars per text object; stay well inside it. */
const MAX_TEXT = 2800;

function truncate(text: string, max = MAX_TEXT): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * Escape Slack mrkdwn control chars in signal-derived text. Scraped competitor
 * content (or LLM output that survives QA) can contain `<url|label>` link
 * syntax or `<!channel>` broadcasts; without this they'd render as clickable
 * links / at-channel pings in the customer's Slack. Slack's rule: escape only
 * & < > (our own `*bold*` markers are added outside this function).
 */
function escapeMrkdwn(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderSlackDigest(ast: BriefingAst): { blocks: unknown[] } {
  const blocks: unknown[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: truncate(`Competitive Briefing — ${ast.periodLabel}`, 150),
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: ast.quietWeek
            ? `${escapeMrkdwn(ast.orgName)} · quiet week — coverage confirmed, little movement`
            : escapeMrkdwn(ast.orgName),
        },
      ],
    },
  ];

  const exec = ast.sections.find((s) => s.key === "exec_summary");
  if (exec) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: truncate(exec.blocks.map((b) => `• ${escapeMrkdwn(b.text)}`).join("\n")),
      },
    });
  }

  const topMoves = ast.sections.find((s) => s.key === "top_moves");
  if (topMoves) {
    blocks.push({ type: "divider" });
    for (const move of topMoves.blocks.slice(0, 5)) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: truncate(
            move.heading
              ? `*${escapeMrkdwn(move.heading)}* — ${escapeMrkdwn(move.text)}`
              : escapeMrkdwn(move.text),
          ),
        },
      });
    }
  }

  // Open actions ride the digest as one compact context line (2.2) —
  // no new notification stream.
  const openActions = ast.sections.find((s) => s.key === "open_actions");
  if (openActions?.blocks[0]) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: truncate(`Open actions: ${escapeMrkdwn(openActions.blocks[0].text)}`),
        },
      ],
    });
  }

  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "Read the full briefing" },
        url: ast.webUrl,
      },
    ],
  });

  return { blocks };
}
