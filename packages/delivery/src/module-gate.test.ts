import { describe, expect, test } from "bun:test";

import { routeSignal, type RoutingConfig } from "./routing";

const config: RoutingConfig = {
  channels: { critical: ["slack"], high: ["slack"], notable: ["email"] },
  quietHours: null,
  timezone: "UTC",
};

const base = {
  config,
  now: new Date("2026-07-01T12:00:00Z"),
  recentAlerts: [],
  mutes: [],
  localHour: 12,
};

describe("module entitlement gate (2.1)", () => {
  test("inactive module suppresses regardless of severity", () => {
    expect(
      routeSignal({
        ...base,
        signal: {
          id: "s1",
          entityId: "e1",
          category: "market_entry",
          moduleKey: "product_market_watch",
          severity: "critical",
        },
        activeModules: ["competitive_watch"],
      }),
    ).toEqual({ kind: "suppressed", reason: "module_inactive" });
  });

  test("active module routes normally; competitive watch untouched", () => {
    const active = ["competitive_watch", "product_market_watch"];
    expect(
      routeSignal({
        ...base,
        signal: {
          id: "s1",
          entityId: "e1",
          category: "market_entry",
          moduleKey: "product_market_watch",
          severity: "high",
        },
        activeModules: active,
      }).kind,
    ).toBe("immediate");
    expect(
      routeSignal({
        ...base,
        signal: {
          id: "s2",
          entityId: "e1",
          category: "pricing",
          moduleKey: "competitive_watch",
          severity: "high",
        },
        activeModules: ["competitive_watch"],
      }).kind,
    ).toBe("immediate");
  });
});
