import { Card } from "@heroui/react";
import Link from "next/link";

import { MISSION_TEMPLATES } from "@ayeastra/workflow";

import { listWatchedEntities } from "@/lib/intel";
import { listMissions, requireWorkflow } from "@/lib/workflow";

import { createMission } from "./actions";

/** Mission Rooms (3.2): standing questions that filter the whole engine. */

const inputClass =
  "w-full rounded border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-600";

export default async function MissionsPage() {
  const session = await requireWorkflow();
  const [missions, watched] = await Promise.all([
    listMissions(session.organizationId),
    listWatchedEntities(session.organizationId),
  ]);

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Missions</h1>

      <Card className="mb-6">
        <Card.Header>
          <Card.Title>New mission</Card.Title>
          <Card.Description>
            A standing question — the engine filters everything through its lens.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <form action={createMission} className="space-y-3">
            <input
              name="goal"
              required
              placeholder='e.g. "Defend against PayBridge"'
              className={inputClass}
            />
            <select name="template" className={inputClass} defaultValue="">
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
            <button
              type="submit"
              className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900"
            >
              Create mission
            </button>
          </form>
        </Card.Content>
      </Card>

      {missions.length === 0 ? (
        <p className="text-sm text-muted">No missions yet.</p>
      ) : (
        missions.map((m) => (
          <Card key={m.id} className="mb-3">
            <Card.Content className="flex items-center justify-between py-4">
              <div>
                <Link href={`/missions/${m.id}`} className="font-medium hover:underline">
                  {m.goal}
                </Link>
                <p className="text-xs text-muted">
                  {m.entityIds.length} entit{m.entityIds.length === 1 ? "y" : "ies"} ·{" "}
                  {m.memberUserIds.length} member{m.memberUserIds.length === 1 ? "" : "s"}
                </p>
              </div>
              <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs uppercase text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                {m.status}
              </span>
            </Card.Content>
          </Card>
        ))
      )}
    </div>
  );
}
