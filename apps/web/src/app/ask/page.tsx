import { Card } from "@heroui/react";
import Link from "next/link";

import { getMessages, listThreads } from "@ayeastra/ask";
import { scopedDb } from "@ayeastra/db";

import { requireActiveSubscription } from "@/lib/auth";
import { listSignals } from "@/lib/intel";

import { askQuestion } from "./actions";

/** Ask surface (web-app doc): thread sidebar + chat, suggested questions on
 * empty state. Answers only from the org's collected intelligence — and it
 * says so when it can't. */

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
  const messages = thread ? await getMessages(scoped, thread) : [];
  const suggestions = suggestionsFrom(recent.signals.map((s) => s.entityName));

  return (
    <div className="container mx-auto flex max-w-5xl gap-6 px-4 py-8">
      <aside className="w-56 shrink-0">
        <Link
          href="/ask"
          className="mb-3 block rounded border border-neutral-300 px-3 py-1.5 text-center text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
        >
          New question
        </Link>
        <div className="space-y-1">
          {threads.map((t) => (
            <Link
              key={t.id}
              href={`/ask?thread=${t.id}`}
              className={`block truncate rounded px-2 py-1.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                t.id === thread ? "bg-neutral-100 font-medium dark:bg-neutral-800" : ""
              }`}
            >
              {t.title}
            </Link>
          ))}
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <h1 className="mb-4 text-xl font-semibold">Ask</h1>

        {messages.length === 0 ? (
          <Card className="mb-4">
            <Card.Content className="space-y-3 py-6">
              <p className="text-sm text-muted">
                Ask anything about the companies you watch — answers come only
                from collected, timestamped evidence.
              </p>
              {suggestions.length > 0 && (
                <div className="space-y-1.5">
                  {suggestions.map((q) => (
                    <form key={q} action={askQuestion}>
                      <input type="hidden" name="question" value={q} />
                      <button type="submit" className="w-full rounded border border-neutral-200 px-3 py-1.5 text-left text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800">
                        {q}
                      </button>
                    </form>
                  ))}
                </div>
              )}
            </Card.Content>
          </Card>
        ) : (
          <div className="mb-4 space-y-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-lg px-4 py-3 text-sm ${
                  m.role === "user"
                    ? "ml-12 bg-neutral-100 dark:bg-neutral-800"
                    : "mr-6 border border-neutral-200 dark:border-neutral-700"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
                <p className="mt-1 text-right text-[11px] text-muted">
                  {TIME_FMT.format(m.createdAt)}
                </p>
              </div>
            ))}
          </div>
        )}

        <form action={askQuestion} className="flex gap-2">
          {thread && <input type="hidden" name="threadId" value={thread} />}
          <input
            name="question"
            aria-label="Your question"
            required
            maxLength={2000}
            placeholder={thread ? "Follow up…" : "What has a competitor done lately?"}
            className="flex-1 rounded border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-600"
          />
          <button type="submit" className="rounded bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300">
            Ask
          </button>
        </form>
      </main>
    </div>
  );
}
