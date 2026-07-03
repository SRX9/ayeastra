import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { backoffSeconds, defineJob, hourBucket } from "./contract";
import { createQueueConsumer } from "./adapters/cf";

const fetchJob = defineJob({
  name: "source.fetch",
  payload: z.object({ sourceId: z.uuid() }),
  idempotencyKey: (p) => `fetch:${p.sourceId}:${hourBucket()}`,
  run: async () => {},
});

describe("job contract", () => {
  test("enforces dot-namespaced names", () => {
    expect(() =>
      defineJob({
        name: "BadName",
        payload: z.object({}),
        idempotencyKey: () => "x",
        run: async () => {},
      }),
    ).toThrow("dot-namespaced");
  });

  test("rejects timeouts over 10 minutes (convention #5)", () => {
    expect(() =>
      defineJob({
        name: "briefing.weekly",
        payload: z.object({}),
        idempotencyKey: () => "x",
        timeoutSeconds: 1200,
        run: async () => {},
      }),
    ).toThrow("decompose");
  });

  test("idempotency keys derive from the natural work unit", () => {
    const id = "0197b7e2-1111-7000-8000-000000000000";
    const key = fetchJob.idempotencyKey({ sourceId: id });
    expect(key).toBe(`fetch:${id}:${hourBucket()}`);
  });

  test("backoff grows exponentially with jitter, capped", () => {
    for (const attempt of [1, 3, 8]) {
      const s = backoffSeconds(attempt);
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThanOrEqual(900);
    }
  });
});

describe("cf queue consumer", () => {
  function fakeMessage(body: unknown) {
    return {
      id: "msg-1",
      attempts: 1,
      body,
      acked: false,
      retried: false,
      ack() {
        this.acked = true;
      },
      retry() {
        this.retried = true;
      },
    };
  }

  test("runs valid payloads and acks", async () => {
    let ran = false;
    const consumer = createQueueConsumer(
      defineJob({
        name: "source.fetch",
        payload: z.object({ sourceId: z.uuid() }),
        idempotencyKey: (p) => `fetch:${p.sourceId}`,
        run: async () => {
          ran = true;
        },
      }),
    );
    const msg = fakeMessage({
      sourceId: "0197b7e2-1111-7000-8000-000000000000",
    });
    await consumer({ messages: [msg] } as never);
    expect(ran).toBe(true);
    expect(msg.acked).toBe(true);
  });

  test("retries on job failure", async () => {
    const consumer = createQueueConsumer(
      defineJob({
        name: "source.fetch",
        payload: z.object({ sourceId: z.uuid() }),
        idempotencyKey: (p) => `fetch:${p.sourceId}`,
        run: async () => {
          throw new Error("firecrawl 503");
        },
      }),
    );
    const msg = fakeMessage({
      sourceId: "0197b7e2-1111-7000-8000-000000000000",
    });
    await consumer({ messages: [msg] } as never);
    expect(msg.retried).toBe(true);
    expect(msg.acked).toBe(false);
  });
});
