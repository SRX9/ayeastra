import Link from "next/link";

import { MISSION_TEMPLATES } from "@ayeastra/workflow";

import { osButtonPrimary, osInput, osModule, osSelect } from "@/components/os/ui";
import { listWatchedEntities } from "@/lib/intel";
import { listMissions, requireWorkflow } from "@/lib/workflow";

import { createMission } from "./actions";

/** Mission Rooms (3.2): standing questions that filter the whole engine. */

export default async function MissionsPage() {
  const session = await requireWorkflow();
  const [missions, watched] = await Promise.all([
    listMissions(session.organizationId),
    listWatchedEntities(session.organizationId),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-medium">Missions</h1>
        <span className="font-mono text-xs tabular-nums text-muted">
          {missions.length} active
        </span>
      </div>

      <details className={`${osModule}`} open={missions.length === 0}>
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span className="font-mono text-xs tracking-wide text-foreground">New Mission</span>
          <span className="text-xs text-muted">
            a standing question the engine filters everything through
          </span>
        </summary>
        <div className="border-t border-border px-4 py-4">
          <form action={createMission} className="space-y-3">
            <input
              name="goal"
              required
              placeholder='e.g. "Defend against PayBridge"'
              className={`${osInput} w-full`}
            />
            <select name="template" className={`${osSelect} w-full`} defaultValue="">
              <option value="">Free-form (no template)</option>
              {MISSION_TEMPLATES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.title}
                </option>
              ))}
            </select>
            <fieldset className="space-y-1">
              <legend className="text-xs text-muted">Entities to watch</legend>
              {watched.map((w) => (
                <label key={w.entityId} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="entityIds" value={w.entityId} />
                  {w.name}
                </label>
              ))}
            </fieldset>
            <button type="submit" className={osButtonPrimary}>
              Create mission
            </button>
          </form>
        </div>
      </details>

      {missions.length === 0 ? (
        <p className="text-center text-sm text-muted">No missions yet.</p>
      ) : (
        <div className={`${osModule} divide-y divide-border`}>
          {missions.map((m) => (
            <Link
              key={m.id}
              href={`/missions/${m.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 no-underline transition-colors hover:bg-surface-secondary"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">
                  {m.goal}
                </span>
                <span className="font-mono text-xs tabular-nums text-muted">
                  {m.entityIds.length} entit{m.entityIds.length === 1 ? "y" : "ies"} ·{" "}
                  {m.memberUserIds.length} member{m.memberUserIds.length === 1 ? "" : "s"}
                </span>
              </span>
              <span className="shrink-0 rounded-md bg-default px-2 py-0.5 font-mono text-[11px] text-muted">
                {m.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
