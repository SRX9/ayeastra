import { describe, expect, test } from "bun:test";

import { routeSignal, type RoutingConfig } from "./routing";

const config: RoutingConfig = {
  channels: { critical: ["slack", "email"], high: ["slack"], notable: [] },
  quietHours: { start: 22, end: 8 },
  timezone: "America/New_York",
};

const signal = (severity: "critical" | "high" | "notable" | "info") => ({
  id: "s1",
  entityId: "e1",
  category: "pricing",
  severity,
});

const base = { config, now: new Date("2026-07-02T18:00:00Z"), recentAlerts: [], mutes: [], localHour: 14 };

describe("signal.route guards", () => {
  test("severity matrix: critical→both, high→slack, notable→digest, info→briefing only", () => {
    expect(routeSignal({ ...base, signal: signal("critical") })).toEqual({
      kind: "immediate",
      channels: ["slack", "email"],
      deferUntil: null,
    });
    expect(routeSignal({ ...base, signal: signal("high") })).toEqual({
      kind: "immediate",
      channels: ["slack"],
      deferUntil: null,
    });
    expect(routeSignal({ ...base, signal: signal("notable") })).toEqual({ kind: "digest" });
    expect(routeSignal({ ...base, signal: signal("info") })).toEqual({ kind: "briefing_only" });
  });

  test("family dedup: second alert for same entity+category in 24h folds into the digest", () => {
    const decision = routeSignal({
      ...base,
      signal: signal("critical"),
      recentAlerts: [{ entityId: "e1", category: "pricing", sentAt: new Date("2026-07-02T10:00:00Z") }],
    });
    expect(decision).toEqual({ kind: "digest" });
    // Different category is a different family.
    const other = routeSignal({
      ...base,
      signal: { ...signal("critical"), category: "launch" },
      recentAlerts: [{ entityId: "e1", category: "pricing", sentAt: new Date("2026-07-02T10:00:00Z") }],
    });
    expect(other.kind).toBe("immediate");
  });

  test("quiet hours defer HIGH to next 8:00 but CRITICAL is exempt", () => {
    const night = { ...base, localHour: 23 };
    const high = routeSignal({ ...night, signal: signal("high") });
    expect(high.kind).toBe("immediate");
    if (high.kind === "immediate") expect(high.deferUntil).not.toBeNull();
    const critical = routeSignal({ ...night, signal: signal("critical") });
    if (critical.kind === "immediate") expect(critical.deferUntil).toBeNull();
  });

  test("quiet-hour window wraps midnight correctly", () => {
    const early = routeSignal({ ...base, localHour: 3, signal: signal("high") });
    if (early.kind === "immediate") expect(early.deferUntil).not.toBeNull();
    const midday = routeSignal({ ...base, localHour: 12, signal: signal("high") });
    if (midday.kind === "immediate") expect(midday.deferUntil).toBeNull();
  });

  test("mutes suppress entity+category and whole-entity rules", () => {
    expect(
      routeSignal({ ...base, signal: signal("critical"), mutes: [{ entityId: "e1", category: "pricing" }] }),
    ).toEqual({ kind: "suppressed", reason: "muted" });
    expect(
      routeSignal({ ...base, signal: signal("critical"), mutes: [{ entityId: "e1", category: null }] }),
    ).toEqual({ kind: "suppressed", reason: "muted" });
    expect(
      routeSignal({ ...base, signal: signal("critical"), mutes: [{ entityId: "e2", category: null }] }).kind,
    ).toBe("immediate");
  });

  test("no configured channels → suppressed visibly, not lost silently", () => {
    const noChannels = { ...config, channels: { ...config.channels, high: [] as never[] } };
    expect(routeSignal({ ...base, config: noChannels, signal: signal("high") })).toEqual({
      kind: "suppressed",
      reason: "no_channels",
    });
  });
});
