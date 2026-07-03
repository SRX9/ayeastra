import { Card } from "@heroui/react";
import Link from "next/link";

import { submitFeedback, updateSignalStatus } from "@/app/dashboard/actions";
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

const actionButton =
  "rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800";

export function SignalCard({ signal }: { signal: FeedSignal }) {
  return (
    <Card className="mb-3">
      <Card.Content className="space-y-2 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityChip severity={signal.severity} />
          <Link
            href={`/entities/${signal.entityId}`}
            className="text-sm font-semibold hover:underline"
          >
            {signal.entityName}
          </Link>
          <span className="text-xs text-muted">{signal.category}</span>
          <span className="ml-auto text-xs text-muted">
            {DATE_FMT.format(signal.createdAt)}
          </span>
        </div>

        <p className="text-sm font-medium">{signal.finding}</p>
        <p className="text-sm text-muted">{signal.whyItMatters}</p>
        {signal.recommendedAction && (
          <p className="text-sm">
            <span className="font-semibold">Do:</span> {signal.recommendedAction}
          </p>
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
                  className={actionButton}
                >
                  {a.label}
                </button>
              ))}
            </form>
          ) : (
            <span className="text-xs text-muted">{signal.status}</span>
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
                className={actionButton}
              >
                {v.label}
              </button>
            ))}
          </form>
        </div>
      </Card.Content>
    </Card>
  );
}
