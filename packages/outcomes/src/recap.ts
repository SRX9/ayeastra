/**
 * Quarterly value recap (2.2 step 4): the renewal-meeting artifact —
 * actions taken by team, outcomes cited, "would have missed" moments.
 * DETERMINISTIC: renewal receipts are counted, never generated. Blocks are
 * shape-compatible with @ayeastra/briefing's BriefingBlock so the recap
 * rides a briefing section (value_recap) and exports as-is.
 */

export interface RecapBlock {
  heading: string | null;
  text: string;
  refs: string[];
  ownerRole: string | null;
}

export interface RecapInput {
  quarterLabel: string;
  actions: Array<{
    description: string;
    status: "open" | "done" | "dropped";
    ownerName: string | null;
  }>;
  /** Closed-with-note rows: kpi is the free-text "what happened". */
  outcomes: Array<{ kpi: string }>;
  /** Feedback notes on `useful` verdicts — the "would have missed" log. */
  wouldHaveMissed: string[];
}

const MAX_LISTED = 5;

export function deriveValueRecap(input: RecapInput): RecapBlock[] {
  const { actions } = input;
  if (actions.length === 0 && input.wouldHaveMissed.length === 0) return [];

  const done = actions.filter((a) => a.status === "done").length;
  const dropped = actions.filter((a) => a.status === "dropped").length;
  const open = actions.length - done - dropped;

  const blocks: RecapBlock[] = [
    {
      heading: null,
      text: `${input.quarterLabel}: ${actions.length} actions tracked — ${done} done, ${dropped} dropped, ${open} open. ${input.outcomes.length} outcomes recorded.`,
      refs: [],
      ownerRole: null,
    },
  ];

  const byOwner = new Map<string, number>();
  for (const a of actions) {
    const owner = a.ownerName ?? "Unassigned";
    byOwner.set(owner, (byOwner.get(owner) ?? 0) + 1);
  }
  if (byOwner.size > 0) {
    blocks.push({
      heading: "Actions by team",
      text: [...byOwner.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([owner, n]) => `${owner}: ${n}`)
        .join(" · "),
      refs: [],
      ownerRole: null,
    });
  }

  if (input.outcomes.length > 0) {
    const listed = input.outcomes.slice(0, MAX_LISTED).map((o) => o.kpi);
    blocks.push({
      heading: "Outcomes cited",
      text:
        listed.join(" · ") +
        (input.outcomes.length > MAX_LISTED
          ? ` · +${input.outcomes.length - MAX_LISTED} more`
          : ""),
      refs: [],
      ownerRole: null,
    });
  }

  if (input.wouldHaveMissed.length > 0) {
    blocks.push({
      heading: "Would have missed",
      text: input.wouldHaveMissed.slice(0, MAX_LISTED).join(" · "),
      refs: [],
      ownerRole: null,
    });
  }

  return blocks;
}
