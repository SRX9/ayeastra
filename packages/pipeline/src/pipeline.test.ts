import { describe, expect, test } from "bun:test";

import { isoWeek } from "./intel/signal-ground";
import {
  briefingBaseline,
  briefingWeekly,
  changeAnalyze,
  changeDetect,
  contextEnrich,
  deliverySend,
  digestDaily,
  embedUpsert,
  schedulerTick,
  signalGround,
  signalRoute,
  sourceFetch,
} from "./index";

/** The job-contract surface — names, payloads, and idempotency keys are the
 * cross-platform wire format, so they are pinned here. */
describe("pipeline job contracts", () => {
  test("every job carries its documented name", () => {
    const names = [
      schedulerTick,
      sourceFetch,
      changeDetect,
      embedUpsert,
      changeAnalyze,
      signalGround,
      signalRoute,
      digestDaily,
      briefingWeekly,
      briefingBaseline,
      deliverySend,
      contextEnrich,
    ].map((j) => j.name);
    expect(names).toEqual([
      "scheduler.tick",
      "source.fetch",
      "change.detect",
      "embed.upsert",
      "change.analyze",
      "signal.ground",
      "signal.route",
      "digest.daily",
      "briefing.weekly",
      "briefing.baseline",
      "delivery.send",
      "context.enrich",
    ]);
  });

  test("seam idempotency keys match the jobs doc", () => {
    const changeId = "0197a000-0000-7000-8000-000000000001";
    expect(changeAnalyze.idempotencyKey({ changeId })).toBe(`analyze:${changeId}`);
    expect(
      sourceFetch.idempotencyKey({ sourceId: changeId, bucket: "2026-07-04T08" }),
    ).toBe(`fetch:${changeId}:2026-07-04T08`);
    expect(
      briefingWeekly.idempotencyKey({ orgId: "org_1", periodStart: "2026-06-29" }),
    ).toBe("briefing:org_1:2026-06-29");
    expect(
      deliverySend.idempotencyKey({ orgId: "org_1", deliveryId: changeId }),
    ).toBe(`deliver:${changeId}`);
  });

  test("isoWeek labels the correlation dedup window", () => {
    expect(isoWeek(new Date("2026-01-01T00:00:00Z"))).toBe("2026-W01");
    expect(isoWeek(new Date("2026-07-04T12:00:00Z"))).toBe("2026-W27");
    // Year boundary: Jan 1 2027 is a Friday → ISO week 53 of 2026.
    expect(isoWeek(new Date("2027-01-01T00:00:00Z"))).toBe("2026-W53");
  });
});
