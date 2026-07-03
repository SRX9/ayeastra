import { describe, expect, test } from "bun:test";

import { CoresignalProvider } from "./coresignal";
import {
  ECONOMICS_MAX_COST_SHARE,
  economicsGate,
  providerPlanGate,
} from "./economics";
import { functionOfTitle, isSeniorTitle, normalizeHiring } from "./hiring";
import {
  diffProviderRecords,
  providerCostEvent,
  providerEvidence,
  providerSourceUrl,
  recordBlocks,
  recordsContentHash,
} from "./ingest";
import type { ProviderRecord } from "./provider";

const rec = (id: string, title = "Software Engineer"): ProviderRecord => ({
  id,
  payload: { title, location: "Remote", postedAt: "2026-06-01" },
});

describe("ingest", () => {
  test("first fetch is a baseline; later fetches diff by record id", () => {
    const first = diffProviderRecords([], [rec("1"), rec("2")]);
    expect(first.changed).toBe(true);
    expect(first.added).toHaveLength(2);

    const same = diffProviderRecords([rec("1"), rec("2")], [rec("2"), rec("1")]);
    expect(same.changed).toBe(false);

    const later = diffProviderRecords([rec("1"), rec("2")], [rec("2"), rec("3")]);
    expect(later.added.map((r) => r.id)).toEqual(["3"]);
    expect(later.removed.map((r) => r.id)).toEqual(["1"]);
  });

  test("content hash is order-insensitive and deterministic", () => {
    expect(recordsContentHash([rec("a"), rec("b")])).toBe(
      recordsContentHash([rec("b"), rec("a")]),
    );
    expect(recordsContentHash([rec("a")])).not.toBe(recordsContentHash([rec("b")]));
  });

  test("source url is unique per provider/kind/entity (global-layer dedupe)", () => {
    expect(providerSourceUrl("coresignal", "hiring_data", "e1")).toBe(
      "provider://coresignal/hiring_data/e1",
    );
  });

  test("evidence carries provider + record ids + retrieval timestamp", () => {
    const provider = new CoresignalProvider("k");
    const diff = diffProviderRecords([], [rec("42", "VP of Sales")]);
    const ev = providerEvidence({
      provider,
      sourceUrl: providerSourceUrl("coresignal", "hiring_data", "e1"),
      fetchedAt: new Date("2026-07-01T00:00:00Z"),
      diff,
      r2RawKey: "providers/coresignal/e1/2026-07-01.json",
    });
    expect(ev.extracted).toEqual({
      provider: "coresignal",
      recordIds: ["42"],
      retrievedAt: "2026-07-01T00:00:00.000Z",
    });
    expect(ev.r2Keys.raw).toContain("2026-07-01");
  });

  test("record blocks feed classify-change with described records", () => {
    const provider = new CoresignalProvider("k");
    const diff = diffProviderRecords([], [rec("1", "VP of Enterprise Sales")]);
    const blocks = recordBlocks(provider, diff);
    expect(blocks.addedBlocks[0]).toBe(
      "Job posting: VP of Enterprise Sales — Remote (posted 2026-06-01)",
    );
    expect(blocks.removedBlocks).toEqual([]);
  });

  test("cost event attributes vendor spend with 6-decimal usd", () => {
    const provider = new CoresignalProvider("k");
    const ev = providerCostEvent({
      provider,
      units: 3,
      usdPerUnit: 0.0125,
      sourceId: "s1",
    });
    expect(ev).toMatchObject({
      vendor: "coresignal",
      taskName: "provider.fetch",
      units: 3,
      costUsd: "0.037500",
    });
  });
});

describe("hiring normalization", () => {
  test("function + seniority classification", () => {
    expect(functionOfTitle("Senior Backend Engineer")).toBe("engineering");
    expect(functionOfTitle("Enterprise Account Executive")).toBe("sales");
    expect(functionOfTitle("Chief of Staff")).toBe("other");
    expect(isSeniorTitle("VP of Enterprise Sales")).toBe(true);
    expect(isSeniorTitle("Sales Development Rep")).toBe(false);
  });

  test("extracted facts: totals, byFunction, senior roles", () => {
    const facts = normalizeHiring(
      [rec("1"), rec("2", "Enterprise Account Executive"), rec("3", "VP of Sales")],
      (r) => ({
        title: String(r.payload.title),
        location: null,
        postedAt: null,
      }),
    );
    expect(facts).toEqual({
      kind: "hiring",
      totalPostings: 3,
      byFunction: { engineering: 1, sales: 2 },
      seniorRoles: ["VP of Sales"],
    });
  });
});

describe("economics gate", () => {
  test("both conditions must clear", () => {
    const base = {
      costPerEntityMonthUsd: 5,
      avgEntitiesPerOrg: 10,
      planMonthlyRevenueUsd: 500,
      namedCustomerRequests: 6,
    };
    expect(economicsGate(base)).toMatchObject({ allowed: true, costShare: 0.1 });

    const tooExpensive = economicsGate({ ...base, costPerEntityMonthUsd: 10 });
    expect(tooExpensive.allowed).toBe(false);
    expect(tooExpensive.costShare).toBeGreaterThanOrEqual(ECONOMICS_MAX_COST_SHARE);

    const noDemand = economicsGate({ ...base, namedCustomerRequests: 4 });
    expect(noDemand.allowed).toBe(false);
    expect(noDemand.reasons[0]).toContain("named requests");

    expect(economicsGate({ ...base, planMonthlyRevenueUsd: 0 }).allowed).toBe(false);
  });
});

describe("plan gate", () => {
  test("business+ default; team only via add-on; unsubscribed never", () => {
    expect(providerPlanGate("business")).toBe(true);
    expect(providerPlanGate("enterprise")).toBe(true);
    expect(providerPlanGate("team")).toBe(false);
    expect(providerPlanGate("team", { teamAddOn: true })).toBe(true);
    expect(providerPlanGate(null)).toBe(false);
  });
});
