import { closeUserAction } from "@/app/(app)/dashboard/actions";
import { osButton, osInput, osModule } from "@/components/os/ui";
import type { OpenAction } from "@/lib/outcomes";

/** Open actions on the dashboard (2.2): close is one click, the note is
 * optional, statuses are open|done|dropped and nothing more. Pure RSC.
 * Collapsed by default so the feed stays the primary object on screen. */

const DATE_FMT = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });

export function ActionsPanel({ open }: { open: OpenAction[] }) {
  if (open.length === 0) return null;
  return (
    <details className={`${osModule} group`}>
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="font-mono text-xs tracking-wide text-foreground">Open Actions</span>
        <span className="font-mono text-xs tabular-nums text-muted">
          {open.length} <span aria-hidden className="ml-1 inline-block group-open:rotate-90">›</span>
        </span>
      </summary>
      <div className="space-y-2 border-t border-border px-4 py-3">
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
            <span className="font-mono text-xs tabular-nums text-muted">
              {DATE_FMT.format(action.createdAt)}
            </span>
            <input
              name="note"
              maxLength={200}
              placeholder="What happened? (optional)"
              className={`${osInput} w-44 px-2 py-0.5 text-xs`}
            />
            <button type="submit" name="disposition" value="done" className={osButton}>
              Done
            </button>
            <button type="submit" name="disposition" value="dropped" className={osButton}>
              Dropped
            </button>
          </form>
        ))}
      </div>
    </details>
  );
}
