import Link from "next/link";

import { getMessages, listThreads } from "@ayeastra/ask";
import { scopedDb } from "@ayeastra/db";

import { osButton, osButtonPrimary, osInput, osModule } from "@/components/os/ui";
import { requireActiveSubscription } from "@/lib/auth";
import { listSignals } from "@/lib/intel";

import { askQuestion } from "./actions";

/** Ask surface (web-app doc): floating thread panel + chat, suggested
 * questions on empty state. Answers only from the org's collected
 * intelligence — and it says so when it can't. */

const TIME_FMT = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** Deterministic empty-state suggestions from recent signals (no model). */
function suggestionsFrom(entities: string[]): string[] {
  const unique = [...new Set(entities)].slice(0, 2);
  const out = unique.map((e) => `What has ${e} done in the last 30 days?`);
  if (unique.length === 2) {
    out.push(`Compare ${unique[0]} and ${unique[1]} pricing moves this quarter`);
  }
  return out;
}

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  const session = await requireActiveSubscription();
  const { thread } = await searchParams;
  const orgId = session.organizationId;
  const scoped = scopedDb(orgId);

  const [threads, recent] = await Promise.all([
    listThreads(scoped, session.user.id),
    listSignals(orgId, {}),
  ]);
  // A hand-edited or stale ?thread= (non-uuid, foreign org, deleted) renders
  // the empty state — never a 500 from a uuid cast or ownership throw.
  const validThread = thread && threads.some((t) => t.id === thread) ? thread : undefined;
  const messages = validThread ? await getMessages(scoped, validThread) : [];
  const suggestions = suggestionsFrom(recent.signals.map((s) => s.entityName));

  return (
    <div className="flex gap-5">
      <aside className={`${osModule} h-fit w-56 shrink-0 p-2`}>
        <Link
          href="/ask"
          className={`${osButton} mb-2 block w-full text-center no-underline`}
        >
          New question
        </Link>
        <div className="space-y-0.5">
          {threads.map((t) => (
            <Link
              key={t.id}
              href={`/ask?thread=${t.id}`}
              className={`block truncate rounded-md px-2 py-1.5 text-sm no-underline ${
                t.id === thread
                  ? "bg-default text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {t.title}
            </Link>
          ))}
        </div>
      </aside>

      <div className="min-w-0 flex-1 space-y-4">
        <h1 className="text-lg font-medium">Ask</h1>

        {messages.length === 0 ? (
          <div className={`${osModule} space-y-3 px-5 py-6`}>
            <p className="text-sm text-muted">
              Ask anything about the companies you watch — answers come only
              from collected, timestamped evidence.
            </p>
            {suggestions.length > 0 && (
              <div className="space-y-1.5">
                {suggestions.map((q) => (
                  <form key={q} action={askQuestion}>
                    <input type="hidden" name="question" value={q} />
                    <button
                      type="submit"
                      className="w-full cursor-pointer rounded-md border border-border px-3 py-1.5 text-left text-sm text-muted transition-colors hover:border-border-secondary hover:text-foreground"
                    >
                      {q}
                    </button>
                  </form>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-lg px-4 py-3 text-sm ${
                  m.role === "user"
                    ? "ml-12 bg-default"
                    : "mr-6 border border-border bg-surface"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
                <p className="mt-1 text-right font-mono text-[11px] tabular-nums text-muted">
                  {TIME_FMT.format(m.createdAt)}
                </p>
              </div>
            ))}
          </div>
        )}

        <form action={askQuestion} className="flex gap-2">
          {validThread && <input type="hidden" name="threadId" value={validThread} />}
          <input
            name="question"
            aria-label="Your question"
            required
            maxLength={2000}
            placeholder={validThread ? "Follow up…" : "What has a competitor done lately?"}
            className={`${osInput} flex-1 px-3 py-2`}
          />
          <button type="submit" className={`${osButtonPrimary} px-4 py-2`}>
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}
