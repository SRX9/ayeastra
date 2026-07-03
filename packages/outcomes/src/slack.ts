import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Slack interactive close (2.2): signature verification + payload parsing,
 * pure over the raw request so the Express route stays a thin shell and the
 * security-relevant logic is unit-tested. The button VALUE is a close token
 * (self-authenticating) — we never trust Slack payload fields for identity.
 */

const SIGNATURE_VERSION = "v0";
/** Slack docs: reject requests older than 5 minutes (replay protection). */
export const MAX_TIMESTAMP_SKEW_S = 300;

export function verifySlackSignature(args: {
  signingSecret: string;
  /** X-Slack-Request-Timestamp header. */
  timestamp: string;
  /** Raw, unparsed request body. */
  body: string;
  /** X-Slack-Signature header. */
  signature: string;
  nowMs?: number;
}): boolean {
  const ts = Number(args.timestamp);
  if (!Number.isFinite(ts)) return false;
  const nowS = (args.nowMs ?? Date.now()) / 1000;
  if (Math.abs(nowS - ts) > MAX_TIMESTAMP_SKEW_S) return false;

  const base = `${SIGNATURE_VERSION}:${args.timestamp}:${args.body}`;
  const expected = `${SIGNATURE_VERSION}=${createHmac("sha256", args.signingSecret)
    .update(base)
    .digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(args.signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface SlackClose {
  /** Close token minted at delivery; verify with verifyCloseToken. */
  token: string;
  /** Slack response_url for the ephemeral confirmation. */
  responseUrl: string | null;
}

/** Buttons carry `action_id: "action_close"` with the token as value. */
export function parseSlackClose(payload: unknown): SlackClose | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as {
    type?: string;
    response_url?: string;
    actions?: Array<{ action_id?: string; value?: string }>;
  };
  if (p.type !== "block_actions") return null;
  const action = p.actions?.find(
    (a) => a.action_id === "action_close" && typeof a.value === "string",
  );
  if (!action?.value) return null;
  return { token: action.value, responseUrl: p.response_url ?? null };
}

/** Block Kit buttons attached wherever a recommendation is delivered —
 * closing happens in the channel the owner already uses. */
export function closeButtons(tokens: { done: string; dropped: string }): unknown {
  return {
    type: "actions",
    elements: [
      {
        type: "button",
        style: "primary",
        text: { type: "plain_text", text: "Done" },
        action_id: "action_close",
        value: tokens.done,
      },
      {
        type: "button",
        text: { type: "plain_text", text: "Dropped" },
        action_id: "action_close",
        value: tokens.dropped,
      },
    ],
  };
}
