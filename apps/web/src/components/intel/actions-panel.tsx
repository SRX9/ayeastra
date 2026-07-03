import { Card } from "@heroui/react";

import { closeUserAction } from "@/app/dashboard/actions";
import type { OpenAction } from "@/lib/outcomes";

/** Open actions on the dashboard (2.2): close is one click, the note is
 * optional, statuses are open|done|dropped and nothing more. Pure RSC. */

const DATE_FMT = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });

const closeButton =
  "rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800";

export function ActionsPanel({ open }: { open: OpenAction[] }) {
  if (open.length === 0) return null;
  return (
    <Card className="mb-5">
      <Card.Header>
        <Card.Title className="text-base">Open actions ({open.length})</Card.Title>
      </Card.Header>
      <Card.Content className="space-y-2">
        {open.map((action) => (
          <form
            key={action.id}
            action={closeUserAction}
            className="flex flex-wrap items-center gap-2"
          >
            <input type="hidden" name="actionId" value={action.id} />
            <span className="min-w-0 flex-1 truncate text-sm">
              {action.description}
            </span>
            <span className="text-xs text-muted">
              {DATE_FMT.format(action.createdAt)}
            </span>
            <input
              name="note"
              maxLength={200}
              placeholder="What happened? (optional)"
              className="w-44 rounded border border-neutral-300 bg-transparent px-2 py-0.5 text-xs dark:border-neutral-600"
            />
            <button type="submit" name="disposition" value="done" className={closeButton}>
              Done
            </button>
            <button type="submit" name="disposition" value="dropped" className={closeButton}>
              Dropped
            </button>
          </form>
        ))}
      </Card.Content>
    </Card>
  );
}
