import { Card } from "@heroui/react";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  parseMissionBrief,
  missionRetroSchema,
} from "@ayeastra/workflow";

import { closeUserAction, createAction } from "@/app/dashboard/actions";
import { getMission, requireWorkflow } from "@/lib/workflow";

import { addMissionMember, transitionMission } from "../actions";

/** The Mission Room: filtered live feed, standing brief, scoped actions,
 * members — intelligence organized around the decision, not the source. */

const buttonClass =
  "rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800";
const inputClass =
  "rounded border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-600";

export default async function MissionRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireWorkflow();
  const { id } = await params;
  const room = await getMission(session.organizationId, id);
  if (!room) notFound();
  const { mission, feed, actions, entityNames } = room;
  const brief = parseMissionBrief(mission.brief);
  const retro = missionRetroSchema.safeParse(mission.retrospective);
  const openActions = actions.filter((a) => a.status === "open");

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{mission.goal}</h1>
          <p className="text-sm text-muted">
            {entityNames.join(" · ")} · {mission.memberUserIds.length} member
            {mission.memberUserIds.length === 1 ? "" : "s"} ·{" "}
            <span className="uppercase">{mission.status}</span>
          </p>
        </div>
        <form action={transitionMission}>
          <input type="hidden" name="missionId" value={mission.id} />
          {mission.status === "draft" && (
            <button type="submit" name="to" value="active" className={buttonClass}>
              Activate
            </button>
          )}
          {mission.status === "active" && (
            <button type="submit" name="to" value="closed" className={buttonClass}>
              Close mission
            </button>
          )}
        </form>
      </div>

      {retro.success && (
        <Card className="mb-4">
          <Card.Header>
            <Card.Title>Retrospective</Card.Title>
          </Card.Header>
          <Card.Content className="space-y-2 text-sm">
            <p>
              <span className="font-medium">What we watched: </span>
              {retro.data.whatWeWatched}
            </p>
            <p>
              <span className="font-medium">What happened: </span>
              {retro.data.whatHappened.text}
            </p>
            <p>
              <span className="font-medium">Actions & outcomes: </span>
              {retro.data.actionsAndOutcomes}
            </p>
            {retro.data.lessons.length > 0 && (
              <ul className="list-disc pl-5">
                {retro.data.lessons.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            )}
          </Card.Content>
        </Card>
      )}

      <Card className="mb-4">
        <Card.Header>
          <Card.Title>Mission brief</Card.Title>
        </Card.Header>
        <Card.Content className="space-y-2 text-sm">
          {brief ? (
            <>
              <p>{brief.situation.text}</p>
              {brief.developments.map((d) => (
                <p key={d.text}>
                  {d.heading && <span className="font-medium">{d.heading}: </span>}
                  {d.text}
                  {d.refs.map((ref) => {
                    const c = brief.citations[ref];
                    return c ? (
                      <Link
                        key={ref}
                        href={`/evidence/${c.evidenceId}`}
                        className="ml-1 rounded bg-neutral-100 px-1 py-0.5 font-mono text-[10px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                      >
                        {ref}
                      </Link>
                    ) : null;
                  })}
                </p>
              ))}
              <p className="text-muted">
                Outlook ({brief.outlook.confidence} confidence): {brief.outlook.text}
              </p>
            </>
          ) : (
            <p className="text-muted">
              No brief yet — it refreshes automatically once the mission is active.
            </p>
          )}
        </Card.Content>
      </Card>

      <Card className="mb-4">
        <Card.Header>
          <Card.Title>Mission actions</Card.Title>
        </Card.Header>
        <Card.Content className="space-y-2 text-sm">
          {openActions.length === 0 && <p className="text-muted">No open actions.</p>}
          {openActions.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2">
              <span>{a.description}</span>
              <form action={closeUserAction} className="flex gap-1">
                <input type="hidden" name="actionId" value={a.id} />
                <button type="submit" name="disposition" value="done" className={buttonClass}>
                  Done
                </button>
                <button type="submit" name="disposition" value="dropped" className={buttonClass}>
                  Drop
                </button>
              </form>
            </div>
          ))}
          {mission.status !== "closed" && (
            <form action={createAction} className="flex gap-2 pt-2">
              <input type="hidden" name="sourceType" value="mission" />
              <input type="hidden" name="sourceId" value={mission.id} />
              <input
                name="description"
                required
                placeholder="Add an action…"
                className={`${inputClass} flex-1`}
              />
              <button type="submit" className={buttonClass}>
                Add
              </button>
            </form>
          )}
        </Card.Content>
      </Card>

      <Card className="mb-4">
        <Card.Header>
          <Card.Title>Live feed</Card.Title>
          <Card.Description>Mission-relevant signals, trailing 30 days.</Card.Description>
        </Card.Header>
        <Card.Content className="space-y-2 text-sm">
          {feed.length === 0 && <p className="text-muted">Nothing relevant yet.</p>}
          {feed.map((s) => (
            <p key={s.id}>
              <span className="font-medium">{s.entity}</span> · {s.category} ·{" "}
              {s.finding}
            </p>
          ))}
        </Card.Content>
      </Card>

      <Card>
        <Card.Header>
          <Card.Title>Members</Card.Title>
        </Card.Header>
        <Card.Content className="space-y-2 text-sm">
          <p className="text-muted">{mission.memberUserIds.join(" · ")}</p>
          {mission.status !== "closed" && (
            <form action={addMissionMember} className="flex gap-2">
              <input type="hidden" name="missionId" value={mission.id} />
              <input
                name="userId"
                required
                placeholder="WorkOS user id"
                className={`${inputClass} flex-1`}
              />
              <button type="submit" className={buttonClass}>
                Add member
              </button>
            </form>
          )}
        </Card.Content>
      </Card>
    </div>
  );
}
