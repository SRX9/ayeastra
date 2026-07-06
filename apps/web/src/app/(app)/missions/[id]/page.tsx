import Link from "next/link";
import { notFound } from "next/navigation";

import {
  parseMissionBrief,
  missionRetroSchema,
} from "@ayeastra/workflow";

import { closeUserAction, createAction } from "@/app/(app)/dashboard/actions";
import { osButton, osInput } from "@/components/os/ui";
import { Window } from "@/components/os/window";
import { getMission, requireWorkflow } from "@/lib/workflow";

import { addMissionMember, transitionMission } from "../actions";

/** The Mission Room: filtered live feed, standing brief, scoped actions,
 * members — intelligence organized around the decision, not the source. */

const sectionHeading = "font-mono text-xs tracking-wide text-muted";

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
    <Window title={mission.goal} meta={mission.status} closeHref="/missions">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-muted">
            {entityNames.join(" · ")} · {mission.memberUserIds.length} member
            {mission.memberUserIds.length === 1 ? "" : "s"}
          </p>
          <form action={transitionMission}>
            <input type="hidden" name="missionId" value={mission.id} />
            {mission.status === "draft" && (
              <button type="submit" name="to" value="active" className={osButton}>
                Activate
              </button>
            )}
            {mission.status === "active" && (
              <button type="submit" name="to" value="closed" className={osButton}>
                Close mission
              </button>
            )}
          </form>
        </div>

        {retro.success && (
          <section className="space-y-2 border-t border-border pt-4 text-sm">
            <h2 className={sectionHeading}>Retrospective</h2>
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
          </section>
        )}

        <section className="space-y-2 border-t border-border pt-4 text-sm">
          <h2 className={sectionHeading}>Mission Brief</h2>
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
                        className="ml-1 rounded-md bg-default px-1.5 py-0.5 font-mono text-[10px] text-muted no-underline hover:text-foreground"
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
        </section>

        <section className="space-y-2 border-t border-border pt-4 text-sm">
          <h2 className={sectionHeading}>Mission Actions</h2>
          {openActions.length === 0 && <p className="text-muted">No open actions.</p>}
          {openActions.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2">
              <span>{a.description}</span>
              <form action={closeUserAction} className="flex gap-1">
                <input type="hidden" name="actionId" value={a.id} />
                <button type="submit" name="disposition" value="done" className={osButton}>
                  Done
                </button>
                <button type="submit" name="disposition" value="dropped" className={osButton}>
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
                className={`${osInput} flex-1`}
              />
              <button type="submit" className={osButton}>
                Add
              </button>
            </form>
          )}
        </section>

        <section className="space-y-2 border-t border-border pt-4 text-sm">
          <h2 className={sectionHeading}>Live Feed</h2>
          <p className="text-xs text-muted">Mission-relevant signals, trailing 30 days.</p>
          {feed.length === 0 && <p className="text-muted">Nothing relevant yet.</p>}
          {feed.map((s) => (
            <p key={s.id}>
              <span className="font-medium">{s.entity}</span>{" "}
              <span className="font-mono text-xs text-muted">{s.category}</span> · {s.finding}
            </p>
          ))}
        </section>

        <section className="space-y-2 border-t border-border pt-4 text-sm">
          <h2 className={sectionHeading}>Members</h2>
          <p className="font-mono text-xs text-muted">{mission.memberUserIds.join(" · ")}</p>
          {mission.status !== "closed" && (
            <form action={addMissionMember} className="flex gap-2">
              <input type="hidden" name="missionId" value={mission.id} />
              <input
                name="userId"
                required
                placeholder="WorkOS user id"
                className={`${osInput} flex-1`}
              />
              <button type="submit" className={osButton}>
                Add member
              </button>
            </form>
          )}
        </section>
      </div>
    </Window>
  );
}
