import Link from "next/link";

import { createAction, submitFeedback, updateSignalStatus } from "@/app/(app)/dashboard/actions";
import { osButton } from "@/components/os/ui";
import type { FeedSignal } from "@/lib/intel";

import {
  ConfidenceBadge,
  EvidenceChips,
  PriorityTags,
  SeverityChip,
} from "./chips";

/** "What changed, why it matters, what to do" in one glance (web-app doc).
 * Pure RSC — quick actions and feedback are plain form posts, no client JS. */

const DATE_FMT = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
});

const STATUS_ACTIONS = [
  { status: "acknowledged", label: "Acknowledge" },
  { status: "snoozed", label: "Snooze 7d" },
  { status: "dismissed", label: "Dismiss" },
] as const;

const VERDICTS = [
  { verdict: "useful", label: "Useful" },
  { verdict: "not_useful", label: "Not useful" },
  { verdict: "wrong", label: "Wrong" },
  { verdict: "already_knew", label: "Knew it" },
] as const;

export function SignalCard({ signal }: { signal: FeedSignal }) {
  return (
    <article className="space-y-2 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityChip severity={signal.severity} />
        <Link
          href={`/entities/${signal.entityId}`}
          className="text-sm font-medium text-foreground no-underline hover:underline"
        >
          {signal.entityName}
        </Link>
        <span className="font-mono text-xs text-muted">{signal.category}</span>
        <span className="ml-auto font-mono text-xs tabular-nums text-muted">
          {DATE_FMT.format(signal.createdAt)}
        </span>
      </div>

      <p className="text-sm font-medium">{signal.finding}</p>
      <p className="text-sm text-muted">{signal.whyItMatters}</p>
      {signal.recommendedAction && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">Do:</span> {signal.recommendedAction}
          </p>
          {/* Outcome loop (2.2): creating an action is one click where the
              recommendation already is — pre-filled, never a form. */}
          <form action={createAction}>
            <input type="hidden" name="sourceType" value="signal" />
            <input type="hidden" name="sourceId" value={signal.id} />
            <input type="hidden" name="description" value={signal.recommendedAction.slice(0, 500)} />
            <button type="submit" className={osButton}>
              Track action
            </button>
          </form>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <PriorityTags attachments={signal.priorityAttachments} />
        <ConfidenceBadge confidence={signal.confidence} />
        <EvidenceChips evidenceIds={signal.evidenceIds} />
      </div>
      {signal.confidenceNotes && (
        <p className="text-xs italic text-muted">
          What would change this: {signal.confidenceNotes}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        {signal.status === "new" ? (
          <form action={updateSignalStatus} className="flex gap-1.5">
            <input type="hidden" name="signalId" value={signal.id} />
            {STATUS_ACTIONS.map((a) => (
              <button
                type="submit"
                key={a.status}
                name="status"
                value={a.status}
                className={osButton}
              >
                {a.label}
              </button>
            ))}
          </form>
        ) : (
          <span className="font-mono text-xs text-muted">{signal.status}</span>
        )}
        <form action={submitFeedback} className="ml-auto flex gap-1.5">
          <input type="hidden" name="targetType" value="signal" />
          <input type="hidden" name="targetId" value={signal.id} />
          {VERDICTS.map((v) => (
            <button
              type="submit"
              key={v.verdict}
              name="verdict"
              value={v.verdict}
              className={osButton}
            >
              {v.label}
            </button>
          ))}
        </form>
      </div>
    </article>
  );
}
