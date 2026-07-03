/**
 * The normalized event vocabulary every fusion computation runs on.
 * Global `changes`, per-org `signals`, and persisted deviations all map to
 * the same StreamEvent shape — the trigger evaluator cannot tell live input
 * from archive replay, which is what makes backtest precision transferable
 * to production firings (fusion doc: calibrated inference).
 */

/** Monday 2020-01-06 UTC — every week/day bucket anchors here. */
export const EPOCH_UTC = Date.UTC(2020, 0, 6);
export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;

export interface StreamEvent {
  id: string;
  entityId: string;
  category: string;
  at: Date;
  /** "event" = material change or org signal; "deviation" = baseline deviation. */
  kind: "event" | "deviation";
}

/** Whole weeks since EPOCH_UTC (Monday-aligned). */
export function weekIndex(d: Date): number {
  return Math.floor((d.getTime() - EPOCH_UTC) / WEEK_MS);
}

export function weekStart(w: number): Date {
  return new Date(EPOCH_UTC + w * WEEK_MS);
}

export function weekEnd(w: number): Date {
  return new Date(EPOCH_UTC + (w + 1) * WEEK_MS);
}

/** "YYYY-MM-DD" UTC — job idempotency buckets and day-grid identity. */
export function dayBucket(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function eventsFromChanges(
  rows: { id: string; entityId: string; category: string; detectedAt: Date }[],
): StreamEvent[] {
  return rows.map((r) => ({
    id: r.id,
    entityId: r.entityId,
    category: r.category,
    at: r.detectedAt,
    kind: "event" as const,
  }));
}

export function eventsFromSignals(
  rows: { id: string; entityId: string; category: string; createdAt: Date }[],
): StreamEvent[] {
  return rows.map((r) => ({
    id: r.id,
    entityId: r.entityId,
    category: r.category,
    at: r.createdAt,
    kind: "event" as const,
  }));
}

export function eventsFromDeviations(
  rows: { id: string; entityId: string; category: string; windowEnd: Date }[],
): StreamEvent[] {
  return rows.map((r) => ({
    id: r.id,
    entityId: r.entityId,
    category: r.category,
    at: r.windowEnd,
    kind: "deviation" as const,
  }));
}
