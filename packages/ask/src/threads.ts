import { eq } from "drizzle-orm";

import {
  askMessages,
  askRole,
  askThreads,
  getDb,
  type Database,
  type ScopedDb,
} from "@ayeastra/db";

type AskRole = (typeof askRole.enumValues)[number];

/**
 * Thread persistence (ask doc). ask_messages hang off ask_threads (no org
 * column), so every access verifies thread ownership through scopedDb first
 * — the same isolation discipline, one join deeper.
 */

export async function createThread(
  scoped: ScopedDb,
  userId: string,
  title: string,
): Promise<string> {
  const [row] = await scoped
    .insert(askThreads, { userId, title })
    .returning({ id: askThreads.id });
  return row!.id;
}

/** Throws unless the thread belongs to the scoped org. */
async function assertOwnership(scoped: ScopedDb, threadId: string) {
  const rows = await scoped.select(askThreads, eq(askThreads.id, threadId));
  if (rows.length === 0) {
    throw new Error(`thread ${threadId} not found for org ${scoped.orgId}`);
  }
}

export async function appendMessage(
  scoped: ScopedDb,
  threadId: string,
  role: AskRole,
  content: string,
  citations?: unknown,
  extras?: {
    /** AI SDK UIMessage.parts; null on plain-text messages (pre-Astra rows). */
    parts?: unknown;
    /** Explicit row id — lets the streaming transport hand the client the
     * same id it persists, so feedback rows reference a real message. */
    id?: string;
  },
  db: Database = getDb(),
): Promise<void> {
  await assertOwnership(scoped, threadId);
  await db.insert(askMessages).values({
    ...(extras?.id ? { id: extras.id } : {}),
    threadId,
    role,
    content,
    citations,
    parts: extras?.parts,
  });
}

/** Persist one question/answer turn atomically — one round trip, and the
 * uuidv7 id tiebreak keeps ordering stable when createdAt collides. */
export async function appendExchange(
  scoped: ScopedDb,
  threadId: string,
  question: string,
  answer: { content: string; citations?: unknown },
  db: Database = getDb(),
): Promise<void> {
  await assertOwnership(scoped, threadId);
  await db.insert(askMessages).values([
    { threadId, role: "user", content: question },
    {
      threadId,
      role: "assistant",
      content: answer.content,
      citations: answer.citations,
    },
  ]);
}

export async function getMessages(
  scoped: ScopedDb,
  threadId: string,
  db: Database = getDb(),
) {
  await assertOwnership(scoped, threadId);
  return db
    .select()
    .from(askMessages)
    .where(eq(askMessages.threadId, threadId))
    .orderBy(askMessages.createdAt, askMessages.id);
}

export async function listThreads(scoped: ScopedDb, userId: string) {
  const rows = await scoped.select(askThreads, eq(askThreads.userId, userId));
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
