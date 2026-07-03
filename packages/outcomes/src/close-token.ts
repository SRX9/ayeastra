import { createHmac, timingSafeEqual } from "node:crypto";

import type { Disposition } from "./transitions";

/**
 * One-click close tokens (2.2): the email "done"/"dropped" links and the
 * Slack button values are self-authenticating — HMAC-signed payloads minted
 * at delivery time, so the close endpoints need no session. Closing an
 * action must never require opening a form OR logging in.
 */

export interface ClosePayload {
  orgId: string;
  actionId: string;
  disposition: Disposition;
  /** Unix ms. Tokens ride weekly artifacts; default life is 30 days. */
  expiresAt: number;
}

export const CLOSE_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function sign(body: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(body).digest();
}

export function mintCloseToken(
  payload: Omit<ClosePayload, "expiresAt">,
  secret: string,
  now: number = Date.now(),
): string {
  if (!secret) throw new Error("mintCloseToken: secret is required");
  const body = Buffer.from(
    JSON.stringify({ ...payload, expiresAt: now + CLOSE_TOKEN_TTL_MS } satisfies ClosePayload),
  ).toString("base64url");
  return `${body}.${sign(body, secret).toString("base64url")}`;
}

export function verifyCloseToken(
  token: string,
  secret: string,
  now: number = Date.now(),
): ClosePayload | null {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  let mac: Buffer;
  try {
    mac = Buffer.from(token.slice(dot + 1), "base64url");
  } catch {
    return null;
  }
  const expected = sign(body, secret);
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) {
    return null;
  }
  let payload: ClosePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    typeof payload.orgId !== "string" ||
    typeof payload.actionId !== "string" ||
    (payload.disposition !== "done" && payload.disposition !== "dropped") ||
    typeof payload.expiresAt !== "number" ||
    payload.expiresAt < now
  ) {
    return null;
  }
  return payload;
}
