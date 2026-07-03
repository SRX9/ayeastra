import { actions, outcomes, scopedDb } from "@ayeastra/db";
import { env } from "@ayeastra/env/server";
import {
  closeAction,
  parseSlackClose,
  verifyCloseToken,
  verifySlackSignature,
  type ClosePayload,
} from "@ayeastra/outcomes";
import { eq } from "drizzle-orm";
import express, { Router, type Response } from "express";

/**
 * Outcome-loop close endpoints (2.2): the email one-click link and the Slack
 * button both carry an HMAC close token minted at delivery — closing needs
 * no session, no form. Routes are thin shells; verification and the state
 * machine live in @ayeastra/outcomes where they're unit-tested.
 */

type CloseResult =
  | { kind: "closed" | "already_closed" | "note_recorded" }
  | { kind: "invalid" | "not_found" };

/** Server-side note cap — the form's maxlength is advisory; a raw POST can
 * carry any size, so bound it before it reaches an outcome row. */
const MAX_NOTE = 500;

async function applyClose(
  payload: ClosePayload,
  note: string | null,
): Promise<CloseResult> {
  const scoped = scopedDb(payload.orgId);
  const [action] = await scoped.select(actions, eq(actions.id, payload.actionId));
  if (!action) return { kind: "not_found" };

  const capped = note?.slice(0, MAX_NOTE) ?? null;
  const descriptor = closeAction(action.status, {
    disposition: payload.disposition,
    note: capped,
  });
  if (!descriptor) {
    // Idempotent one-click links: re-clicking is fine, and a note sent after
    // the close (the email confirmation form) still lands as an outcome.
    const trimmed = capped?.trim();
    if (action.status === payload.disposition && trimmed) {
      await scoped.insert(outcomes, {
        actionId: action.id,
        kpi: trimmed,
        result: action.status,
        evidenceIds: [],
      });
      return { kind: "note_recorded" };
    }
    return { kind: "already_closed" };
  }

  await scoped.update(actions, descriptor.update, eq(actions.id, action.id));
  if (descriptor.outcome) {
    await scoped.insert(outcomes, {
      actionId: action.id,
      kpi: descriptor.outcome.kpi,
      result: descriptor.outcome.result,
      evidenceIds: [],
    });
  }
  return { kind: "closed" };
}

// Node's base64url decode is lenient, so a verified token can still carry
// stray characters — only ever reflect strict base64url into markup.
const STRICT_TOKEN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

const PAGE_HEAD = `<!doctype html><meta charset="utf-8"><title>AyeAstra</title>
<body style="font-family:system-ui;max-width:28rem;margin:4rem auto">`;

/** Minimal HTML so the email click lands somewhere honest, with the optional
 * one-line "what happened?" — never a required form. */
function closePage(message: string, token?: string): string {
  const form =
    token && STRICT_TOKEN.test(token)
      ? `<form method="post" action="/api/actions/close">
        <input type="hidden" name="token" value="${token}" />
        <input name="note" maxlength="200" placeholder="What happened? (optional)" />
        <button type="submit">Save</button>
      </form>`
      : "";
  return `${PAGE_HEAD}<p>${message}</p>${form}</body>`;
}

/**
 * The GET link renders this — a POST form, never the close itself. Email link
 * scanners / prefetchers follow GET links, so a GET must be side-effect free;
 * the disposition is only applied when the recipient submits the form (POST).
 */
function confirmPage(disposition: string, token: string): string {
  return `${PAGE_HEAD}<p>Mark this action as <strong>${disposition}</strong>?</p>
<form method="post" action="/api/actions/close">
  <input type="hidden" name="token" value="${token}" />
  <input name="note" maxlength="200" placeholder="What happened? (optional)" />
  <button type="submit">Confirm</button>
</form></body>`;
}

export const outcomesRouter: Router = Router();

async function handleClose(res: Response, token: unknown, note: unknown) {
  if (!env.ACTION_CLOSE_SECRET) {
    res.status(501).send("Action close links are not configured");
    return;
  }
  const payload =
    typeof token === "string" ? verifyCloseToken(token, env.ACTION_CLOSE_SECRET) : null;
  if (!payload) {
    res.status(400).send(closePage("This link is invalid or has expired."));
    return;
  }
  const result = await applyClose(payload, typeof note === "string" ? note : null);
  switch (result.kind) {
    case "not_found":
      res.status(404).send(closePage("This action no longer exists."));
      return;
    case "already_closed":
    case "note_recorded":
      res.send(closePage("Already recorded — thanks."));
      return;
    case "closed":
      res.send(
        closePage(
          `Action marked ${payload.disposition}.`,
          typeof token === "string" ? token : undefined,
        ),
      );
      return;
    default:
      res.status(400).send(closePage("This link is invalid or has expired."));
  }
}

// Email one-click link (GET): render a confirmation form only — no mutation,
// so URL scanners can't close actions by prefetching the link.
outcomesRouter.get("/api/actions/close", (req, res) => {
  if (!env.ACTION_CLOSE_SECRET) {
    res.status(501).send("Action close links are not configured");
    return;
  }
  const token = req.query.token;
  const payload =
    typeof token === "string" ? verifyCloseToken(token, env.ACTION_CLOSE_SECRET) : null;
  if (!payload || typeof token !== "string" || !STRICT_TOKEN.test(token)) {
    res.status(400).send(closePage("This link is invalid or has expired."));
    return;
  }
  res.send(confirmPage(payload.disposition, token));
});

// The confirmation form posts here — this is where the close is applied.
outcomesRouter.post(
  "/api/actions/close",
  express.urlencoded({ extended: false }),
  async (req, res) => {
    try {
      await handleClose(res, req.body?.token, req.body?.note ?? null);
    } catch (err) {
      console.error("apps/server: action close failed", err);
      if (!res.headersSent) {
        res.status(500).send(closePage("Something went wrong — please try again."));
      }
    }
  },
);

// Slack interactive close. Raw body capture — the signature covers the exact
// bytes Slack sent, so this route must never see a pre-parsed body.
outcomesRouter.post(
  "/api/slack/interactions",
  express.raw({ type: "application/x-www-form-urlencoded", limit: "1mb" }),
  async (req, res) => {
    if (!env.SLACK_SIGNING_SECRET || !env.ACTION_CLOSE_SECRET) {
      res.status(501).send("Slack interactivity is not configured");
      return;
    }
    const body = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
    const verified = verifySlackSignature({
      signingSecret: env.SLACK_SIGNING_SECRET,
      timestamp: String(req.headers["x-slack-request-timestamp"] ?? ""),
      signature: String(req.headers["x-slack-signature"] ?? ""),
      body,
    });
    if (!verified) {
      res.status(401).send("bad signature");
      return;
    }

    let parsed: ReturnType<typeof parseSlackClose> = null;
    try {
      parsed = parseSlackClose(
        JSON.parse(new URLSearchParams(body).get("payload") ?? "null"),
      );
    } catch {
      // fall through to 200 below — Slack retries on non-2xx, and a
      // malformed interaction is not retryable.
    }
    // Ack within Slack's 3s window before any follow-up work.
    res.status(200).send();
    if (!parsed) return;

    // Body already acked — any failure here must be swallowed, not left as an
    // unhandled rejection.
    try {
      const payload = verifyCloseToken(parsed.token, env.ACTION_CLOSE_SECRET);
      if (!payload) return;
      const result = await applyClose(payload, null);
      if (parsed.responseUrl && (result.kind === "closed" || result.kind === "already_closed")) {
        const text =
          result.kind === "closed"
            ? `Action marked ${payload.disposition}.`
            : "Already recorded — thanks.";
        await fetch(parsed.responseUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, response_type: "ephemeral" }),
        }).catch(() => {
          // Confirmation is best-effort; the close itself already persisted.
        });
      }
    } catch (err) {
      console.error("apps/server: slack close failed", err);
    }
  },
);
