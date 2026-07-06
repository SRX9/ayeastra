import { Alert } from "@heroui/react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { currentContext } from "@ayeastra/core";
import { scopedDb, severity, signalCategory } from "@ayeastra/db";

import { ActionsPanel } from "@/components/intel/actions-panel";
import { SignalCard } from "@/components/intel/signal-card";
import { osButton, osModule, osSelect } from "@/components/os/ui";
import { requireActiveSubscription } from "@/lib/auth";
import {
  listSignals,
  listWatchedEntities,
  watchStats,
  type Category,
  type Severity,
} from "@/lib/intel";
import { listOpenActions } from "@/lib/outcomes";

// Runtime enum guards keep hand-edited URLs from reaching the DB layer.
const SEVERITIES = new Set<string>(severity.enumValues);
const CATEGORIES = new Set<string>(signalCategory.enumValues);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const one = (v: string | string[] | undefined) =>
  typeof v === "string" && v !== "" ? v : undefined;

const oneUuid = (v: string | string[] | undefined) => {
  const s = one(v);
  return s && UUID.test(s) ? s : undefined;
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireActiveSubscription();
  // The feed requires an activated Intelligence Plan (web-app doc guard).
  const context = await currentContext(scopedDb(session.organizationId));
  if (!context) redirect("/onboarding/context");
  const params = await searchParams;
  const sev = one(params.severity);
  const cat = one(params.category);

  const filters = {
    severity: sev && SEVERITIES.has(sev) ? (sev as Severity) : undefined,
    category: cat && CATEGORIES.has(cat) ? (cat as Category) : undefined,
    // uuid-guarded: a hand-edited value must not reach a Postgres uuid cast.
    entityId: oneUuid(params.entity),
    before: oneUuid(params.before),
  };

  const orgId = session.organizationId;
  const [{ signals, nextCursor }, watched, stats, openActions] = await Promise.all([
    listSignals(orgId, filters),
    listWatchedEntities(orgId),
    watchStats(orgId),
    listOpenActions(orgId),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {session.billing.pastDue && (
        <Alert status="danger" className="mb-6">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              Your last payment failed — access continues while Stripe retries.{" "}
              <Link href="/settings/billing" className="link underline underline-offset-4">
                Update your payment method
              </Link>
              .
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-medium">Feed</h1>
        <span className="font-mono text-xs tabular-nums text-muted">
          watching {stats.sourceCount} sources · {stats.entityCount} competitors
        </span>
      </div>

      <ActionsPanel open={openActions} />

      <form className="flex flex-wrap items-center gap-2" method="get">
        <select name="severity" defaultValue={filters.severity ?? ""} className={osSelect}>
          <option value="">All severities</option>
          {severity.enumValues.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select name="category" defaultValue={filters.category ?? ""} className={osSelect}>
          <option value="">All categories</option>
          {signalCategory.enumValues.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select name="entity" defaultValue={filters.entityId ?? ""} className={osSelect}>
          <option value="">All entities</option>
          {watched.map((e) => (
            <option key={e.entityId} value={e.entityId}>{e.name}</option>
          ))}
        </select>
        <button type="submit" className={osButton}>
          Filter
        </button>
      </form>

      {signals.length === 0 ? (
        <div className={osModule}>
          <div className="px-6 py-10 text-center text-sm text-muted">
            {stats.sourceCount > 0 ? (
              <>
                Watching {stats.sourceCount} sources across {stats.entityCount}{" "}
                competitors — first signals land here when something changes.{" "}
                <Link href="/briefings" className="link underline underline-offset-4">
                  Read your Baseline Dossier
                </Link>{" "}
                in the meantime.
              </>
            ) : (
              <>
                Nothing is being watched yet —{" "}
                <Link href="/entities" className="link underline underline-offset-4">
                  add competitors
                </Link>{" "}
                to start collecting.
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {signals.map((signal) => (
            <SignalCard key={signal.id} signal={signal} />
          ))}
          {nextCursor && (
            <div className="py-3 text-center">
              <Link
                href={{ pathname: "/dashboard", query: { ...params, before: nextCursor } }}
                className="font-mono text-xs text-muted no-underline hover:text-foreground"
              >
                older signals ↓
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
