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
            ? `${ast.orgName} · quiet week — coverage confirmed, little movement`
            : ast.orgName,
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
        text: truncate(exec.blocks.map((b) => `• ${b.text}`).join("\n")),
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
            move.heading ? `*${move.heading}* — ${move.text}` : move.text,
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
        { type: "mrkdwn", text: truncate(`Open actions: ${openActions.blocks[0].text}`) },
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
