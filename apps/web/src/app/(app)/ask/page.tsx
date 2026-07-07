import Link from "next/link";

import { getMessages, listThreads } from "@ayeastra/ask";
import { scopedDb } from "@ayeastra/db";

import { AstraChat } from "@/components/astra/astra-chat";
import { osButton, osModule } from "@/components/os/ui";
import { toUIMessages, type StoredAskMessage } from "@/lib/astra";
import { requireActiveSubscription } from "@/lib/auth";
import { astraSuggestions } from "@/lib/suggestions";

/** Ask surface — the full-screen face of Astra ("one brain, two surfaces":
 * the floating panel shares the same transport and threads). History is
 * server-loaded; streaming goes through /api/astra/chat. */

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  const session = await requireActiveSubscription();
  const { thread } = await searchParams;
  const orgId = session.organizationId;
  const scoped = scopedDb(orgId);

  const threads = await listThreads(scoped, session.user.id);
  // A hand-edited or stale ?thread= (non-uuid, foreign org, deleted) renders
  // the empty state — never a 500 from a uuid cast or ownership throw.
  const validThread = thread && threads.some((t) => t.id === thread) ? thread : undefined;
  const [messages, suggestions] = await Promise.all([
    validThread
      ? getMessages(scoped, validThread)
      : Promise.resolve([] as StoredAskMessage[]),
    astraSuggestions(orgId).then((s) => s.slice(0, 4)).catch(() => [] as string[]),
  ]);

  return (
    <div className="flex h-[calc(100vh-12rem)] min-h-96 gap-5">
      <aside className={`${osModule} h-fit max-h-full w-56 shrink-0 overflow-y-auto p-2`}>
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

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <h1 className="shrink-0 text-lg font-medium">Ask</h1>
        <AstraChat
          key={validThread ?? "new"}
          variant="page"
          threadId={validThread}
          initialMessages={toUIMessages(messages as StoredAskMessage[])}
          suggestions={suggestions}
        />
      </div>
    </div>
  );
}
