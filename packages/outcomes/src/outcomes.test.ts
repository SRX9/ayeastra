import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";

import {
  closeAction,
  canTransition,
  CLOSE_TOKEN_TTL_MS,
  closeButtons,
  deriveValueRecap,
  mintCloseToken,
  parseSlackClose,
  pressuredCategories,
  verifyCloseToken,
  verifySlackSignature,
} from "./index";

describe("transitions", () => {
  test("open closes to done/dropped; closes are terminal", () => {
    expect(canTransition("open", "done")).toBe(true);
    expect(canTransition("open", "dropped")).toBe(true);
    expect(canTransition("done", "dropped")).toBe(false);
    expect(canTransition("dropped", "done")).toBe(false);
  });

  test("close without note → no outcome row (one click, never a form)", () => {
    const d = closeAction("open", { disposition: "done" }, new Date("2026-07-01"));
    expect(d!.update.status).toBe("done");
    expect(d!.outcome).toBeNull();
  });

  test("close with note → outcomes row with the note as free-text kpi", () => {
    const d = closeAction("open", {
      disposition: "done",
      note: "won deal vs PayBridge",
    });
    expect(d!.outcome).toEqual({ kpi: "won deal vs PayBridge", result: "done" });
  });

  test("closing an already-closed action is refused", () => {
    expect(closeAction("done", { disposition: "dropped" })).toBeNull();
  });

  test("whitespace-only note is treated as no note", () => {
    expect(closeAction("open", { disposition: "dropped", note: "  " })!.outcome).toBeNull();
  });
});

describe("close tokens", () => {
  const secret = "test-secret";
  const payload = { orgId: "org_1", actionId: "a1", disposition: "done" as const };

  test("round-trips", () => {
    const token = mintCloseToken(payload, secret);
    expect(verifyCloseToken(token, secret)).toMatchObject(payload);
  });

  test("rejects tampering, wrong secret, and expiry", () => {
    const token = mintCloseToken(payload, secret, 0);
    expect(verifyCloseToken(token, "other-secret", 1000)).toBeNull();
    const [body, mac] = token.split(".") as [string, string];
    const forged = `${Buffer.from(
      JSON.stringify({ ...payload, actionId: "a2", expiresAt: CLOSE_TOKEN_TTL_MS }),
    ).toString("base64url")}.${mac}`;
    expect(verifyCloseToken(forged, secret, 1000)).toBeNull();
    expect(verifyCloseToken(`${body}.${mac}`, secret, CLOSE_TOKEN_TTL_MS + 1)).toBeNull();
    expect(verifyCloseToken("garbage", secret)).toBeNull();
  });
});

describe("slack", () => {
  const signingSecret = "slack-secret";

  function signedRequest(body: string, tsSeconds: number) {
    const timestamp = String(tsSeconds);
    const signature = `v0=${createHmac("sha256", signingSecret)
      .update(`v0:${timestamp}:${body}`)
      .digest("hex")}`;
    return { timestamp, signature };
  }

  test("verifies a correctly signed request", () => {
    const body = "payload=%7B%7D";
    const { timestamp, signature } = signedRequest(body, 1_000_000);
    expect(
      verifySlackSignature({
        signingSecret,
        timestamp,
        body,
        signature,
        nowMs: 1_000_000_000,
      }),
    ).toBe(true);
  });

  test("rejects stale timestamps (replay) and bad signatures", () => {
    const body = "payload=%7B%7D";
    const { timestamp, signature } = signedRequest(body, 1_000_000);
    expect(
      verifySlackSignature({
        signingSecret,
        timestamp,
        body,
        signature,
        nowMs: (1_000_000 + 301) * 1000,
      }),
    ).toBe(false);
    expect(
      verifySlackSignature({
        signingSecret,
        timestamp,
        body: body + "x",
        signature,
        nowMs: 1_000_000_000,
      }),
    ).toBe(false);
  });

  test("parses the close button out of a block_actions payload", () => {
    expect(
      parseSlackClose({
        type: "block_actions",
        response_url: "https://hooks.slack.com/r/1",
        actions: [{ action_id: "action_close", value: "tok123" }],
      }),
    ).toEqual({ token: "tok123", responseUrl: "https://hooks.slack.com/r/1" });
    expect(parseSlackClose({ type: "view_submission" })).toBeNull();
    expect(parseSlackClose(null)).toBeNull();
  });

  test("closeButtons carries tokens as values", () => {
    const block = closeButtons({ done: "t1", dropped: "t2" }) as {
      elements: Array<{ action_id: string; value: string }>;
    };
    expect(block.elements.map((e) => e.value)).toEqual(["t1", "t2"]);
    expect(block.elements.every((e) => e.action_id === "action_close")).toBe(true);
  });
});

describe("budget pressure", () => {
  test("≥3 dropped and more dropped than done → pressured", () => {
    const rows = [
      ...Array.from({ length: 3 }, () => ({ category: "hiring", status: "dropped" as const })),
      { category: "hiring", status: "done" as const },
      ...Array.from({ length: 3 }, () => ({ category: "pricing", status: "dropped" as const })),
      ...Array.from({ length: 4 }, () => ({ category: "pricing", status: "done" as const })),
      { category: "launch", status: "dropped" as const },
    ];
    const pressured = pressuredCategories(rows);
    expect(pressured.has("hiring")).toBe(true);
    expect(pressured.has("pricing")).toBe(false); // useful more often than not
    expect(pressured.has("launch")).toBe(false); // under the floor
  });
});

describe("value recap", () => {
  test("counts, per-owner rollup, outcomes, would-have-missed", () => {
    const blocks = deriveValueRecap({
      quarterLabel: "Q2 2026",
      actions: [
        { description: "a", status: "done", ownerName: "Sam" },
        { description: "b", status: "done", ownerName: "Sam" },
        { description: "c", status: "dropped", ownerName: "Ana" },
        { description: "d", status: "open", ownerName: null },
      ],
      outcomes: [{ kpi: "won deal vs PayBridge" }],
      wouldHaveMissed: ["caught PayBridge repricing before QBR"],
    });
    expect(blocks[0]!.text).toBe(
      "Q2 2026: 4 actions tracked — 2 done, 1 dropped, 1 open. 1 outcomes recorded.",
    );
    const headings = blocks.map((b) => b.heading);
    expect(headings).toContain("Actions by team");
    expect(headings).toContain("Outcomes cited");
    expect(headings).toContain("Would have missed");
    expect(blocks.find((b) => b.heading === "Actions by team")!.text).toBe(
      "Sam: 2 · Ana: 1 · Unassigned: 1",
    );
  });

  test("empty quarter → no section (honest omission)", () => {
    expect(
      deriveValueRecap({
        quarterLabel: "Q2",
        actions: [],
        outcomes: [],
        wouldHaveMissed: [],
      }),
    ).toEqual([]);
  });
});
