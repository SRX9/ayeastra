/**
 * Adaptive per-source cadence (collection doc) — the #1 COGS lever.
 * Pure functions; scheduler.tick applies them to monitor_state rows.
 */

/** Interval bounds in minutes by source kind (doc table). */
export const INTERVAL_BOUNDS: Record<string, { floor: number; ceiling: number }> = {
  pricing: { floor: 360, ceiling: 2880 }, // 6h–48h
  changelog: { floor: 360, ceiling: 1440 }, // 6h–24h
  blog: { floor: 360, ceiling: 1440 },
  careers: { floor: 1440, ceiling: 4320 }, // 24h–72h
  docs: { floor: 1440, ceiling: 10080 }, // 24h–7d
  homepage: { floor: 1440, ceiling: 10080 },
  news: { floor: 60, ceiling: 360 }, // 1h–6h
  filings: { floor: 60, ceiling: 360 },
  app_store: { floor: 360, ceiling: 1440 },
};

const DEFAULT_BOUNDS = { floor: 360, ceiling: 2880 };

export function boundsFor(kind: string): { floor: number; ceiling: number } {
  return INTERVAL_BOUNDS[kind] ?? DEFAULT_BOUNDS;
}

/**
 * Material change → tighten ×0.5 toward floor; quiet check → decay ×1.3
 * toward ceiling. pinned_interval overrides everything (ops control).
 */
export function nextInterval(args: {
  current: number;
  kind: string;
  materialChange: boolean;
  pinned?: number | null;
}): number {
  if (args.pinned) return args.pinned;
  const { floor, ceiling } = boundsFor(args.kind);
  const next = args.materialChange ? args.current * 0.5 : args.current * 1.3;
  return Math.round(Math.min(ceiling, Math.max(floor, next)));
}

/** EWMA of "did this check find a change", α = 0.3 (doc). */
export function nextEwma(prev: number, changed: boolean): number {
  return 0.3 * (changed ? 1 : 0) + 0.7 * prev;
}

/**
 * Failure ladder (collection doc): retries exhausted repeatedly →
 * degraded at 3, broken at 5 (internal alert + coverage-page copy).
 */
export function statusForFailures(
  consecutiveFailures: number,
): "ok" | "degraded" | "broken" {
  if (consecutiveFailures >= 5) return "broken";
  if (consecutiveFailures >= 3) return "degraded";
  return "ok";
}
