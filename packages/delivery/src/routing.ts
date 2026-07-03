/**
 * signal.route guards (alerts doc), pure and in order: routing config →
 * quiet hours (CRITICAL exempt) → family-dedup window → per-user mutes.
 * The job persists the returned decision as deliveries rows; sends are
 * driven off that table only.
 */

export type Severity = "critical" | "high" | "notable" | "info";
export type Channel = "slack" | "email";

export interface RoutingConfig {
  /** From Intelligence Plan / Settings (BusinessContext.delivery.alertRouting). */
  channels: Record<"critical" | "high" | "notable", Channel[]>;
  /** Local hours [start, end) during which immediate alerts hold to 8:00. */
  quietHours: { start: number; end: number } | null;
  timezone: string;
}

export interface RoutableSignal {
  id: string;
  entityId: string;
  category: string;
  severity: Severity;
}

export interface RecentAlert {
  entityId: string;
  category: string;
  sentAt: Date;
}

export interface MuteRule {
  entityId: string;
  /** null = whole entity muted. */
  category: string | null;
}

export type RouteDecision =
  | { kind: "immediate"; channels: Channel[]; deferUntil: Date | null }
  | { kind: "digest" }
  | { kind: "briefing_only" }
  | { kind: "suppressed"; reason: "muted" | "family_dedup" | "no_channels" };

export const FAMILY_DEDUP_HOURS = 24;

export function routeSignal(args: {
  signal: RoutableSignal;
  config: RoutingConfig;
  now: Date;
  /** Immediate alerts sent in the trailing dedup window. */
  recentAlerts: RecentAlert[];
  mutes: MuteRule[];
  /** Local hour at `now` in the org's timezone (caller computes via Intl). */
  localHour: number;
}): RouteDecision {
  const { signal, config } = args;

  if (
    args.mutes.some(
      (m) =>
        m.entityId === signal.entityId &&
        (m.category === null || m.category === signal.category),
    )
  ) {
    return { kind: "suppressed", reason: "muted" };
  }

  // INFO never notifies on its own — weekly briefing only.
  if (signal.severity === "info") return { kind: "briefing_only" };
  if (signal.severity === "notable") return { kind: "digest" };

  // Immediate severities: family dedup — one interrupt per entity+category
  // per window; later ones fold into the digest.
  const windowStart = args.now.getTime() - FAMILY_DEDUP_HOURS * 3_600_000;
  const dupe = args.recentAlerts.some(
    (a) =>
      a.entityId === signal.entityId &&
      a.category === signal.category &&
      a.sentAt.getTime() >= windowStart,
  );
  if (dupe) return { kind: "suppressed", reason: "family_dedup" };

  const channels = config.channels[signal.severity];
  if (channels.length === 0) return { kind: "suppressed", reason: "no_channels" };

  // Quiet hours hold HIGH until the next 8:00; CRITICAL is exempt.
  let deferUntil: Date | null = null;
  if (
    signal.severity === "high" &&
    config.quietHours &&
    inQuietHours(args.localHour, config.quietHours)
  ) {
    deferUntil = nextLocalEight(args.now, args.localHour);
  }

  return { kind: "immediate", channels, deferUntil };
}

function inQuietHours(hour: number, q: { start: number; end: number }): boolean {
  // Window may wrap midnight (e.g. 22–8).
  return q.start <= q.end
    ? hour >= q.start && hour < q.end
    : hour >= q.start || hour < q.end;
}

function nextLocalEight(now: Date, localHour: number): Date {
  const hoursUntil = localHour < 8 ? 8 - localHour : 32 - localHour;
  return new Date(now.getTime() + hoursUntil * 3_600_000);
}
