"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import {
  answerAsk,
  buildFactSheet,
  embed,
  parseAskQuery,
  rerankResults,
} from "@ayeastra/ai";
import {
  appendExchange,
  createThread,
  decideRefusal,
  getMessages,
  refusalMessage,
  retrieveChangesByVector,
  retrieveSignalsByKeyword,
  retrieveSignalsByVector,
  rrfMerge,
  topSimilarity,
} from "@ayeastra/ask";
import { entityAliases, getDb, orgEntities, scopedDb } from "@ayeastra/db";
import { eq } from "drizzle-orm";

import { requireAuth } from "@/lib/auth";
import { listWatchedEntities } from "@/lib/intel";

/**
 * The Ask pipeline (ask doc): parse → retrieve → rerank → synthesize, with
 * the deterministic refusal gate in front of synthesis. v1 is a server
 * action (non-streaming); the streaming route replaces the transport, not
 * the pipeline. Without LLM credentials it degrades to an honest notice.
 */

const Input = z.object({
  question: z.string().min(1).max(2000),
  threadId: z.uuid().optional(),
});

export async function askQuestion(formData: FormData) {
  const session = await requireAuth();
  if (!session.organizationId) return;
  const parsed = Input.safeParse({
    question: formData.get("question"),
    threadId: formData.get("threadId") || undefined,
  });
  if (!parsed.success) return;
  const { question, threadId: existingThreadId } = parsed.data;

  const orgId = session.organizationId;
  const scoped = scopedDb(orgId);
  const threadId =
    existingThreadId ??
    (await createThread(scoped, session.user.id, question.slice(0, 80)));

  // Answer from prior turns, then persist the whole exchange atomically.
  const result = await answer(orgId, threadId, question);
  await appendExchange(scoped, threadId, question, result);

  redirect(`/ask?thread=${threadId}`);
}

async function answer(
  orgId: string,
  threadId: string,
  question: string,
): Promise<{ content: string; citations: unknown }> {
  if (!process.env.LLM_API_KEY) {
    return {
      content:
        "The AI engine isn't configured yet (LLM credentials pending), so I can't answer — your question is saved and the archive keeps collecting.",
      citations: null,
    };
  }

  const db = getDb();
  const scoped = scopedDb(orgId);
  const [watched, allMessages, aliases] = await Promise.all([
    listWatchedEntities(orgId),
    getMessages(scoped, threadId, db),
    // Aliases of this org's watched entities, independent of the list above.
    db
      .select({ entityId: entityAliases.entityId, alias: entityAliases.alias })
      .from(entityAliases)
      .innerJoin(orgEntities, eq(orgEntities.entityId, entityAliases.entityId))
      .where(scoped.scope(orgEntities)),
  ]);
  const watchedNames = watched.map((w) => w.name);
  // The current question isn't persisted yet — these are all prior turns.
  const priorTurns = allMessages.slice(-6).map((m) => m.content);

  const aliasesByEntity = new Map<string, string[]>();
  for (const a of aliases) {
    const list = aliasesByEntity.get(a.entityId) ?? [];
    list.push(a.alias);
    aliasesByEntity.set(a.entityId, list);
  }

  const parsed = await parseAskQuery.run(
    {
      query: question,
      today: new Date().toISOString().slice(0, 10),
      watchedEntities: watched.map((w) => ({
        id: w.entityId,
        name: w.name,
        aliases: aliasesByEntity.get(w.entityId) ?? [],
      })),
      thread: priorTurns,
    },
    { orgId },
  );

  const filters = {
    entityIds: parsed.entityIds.length ? parsed.entityIds : undefined,
    from: parsed.from ? new Date(parsed.from) : undefined,
    to: parsed.to ? new Date(parsed.to) : undefined,
    categories: parsed.categories.length ? parsed.categories : undefined,
  };
  const [queryEmbedding] = await embed([parsed.rewrittenQuery], { orgId });
  const [vSignals, vChanges, kSignals] = await Promise.all([
    retrieveSignalsByVector(orgId, queryEmbedding!, filters),
    retrieveChangesByVector(orgId, queryEmbedding!, filters),
    retrieveSignalsByKeyword(orgId, parsed.rewrittenQuery, filters),
  ]);
  const merged = rrfMerge([vSignals, vChanges, kSignals]);

  const refusal = decideRefusal(parsed, {
    topSimilarity: topSimilarity([vSignals, vChanges]),
    resultCount: merged.length,
  });
  if (refusal) {
    return { content: refusalMessage(refusal, watchedNames), citations: null };
  }

  const reranked = await rerankResults.run(
    {
      query: parsed.rewrittenQuery,
      candidates: merged.map((m) => ({ id: m.id, text: m.text })),
    },
    { orgId },
  );
  const byId = new Map(merged.map((m) => [m.id, m]));
  const top = reranked.ranked
    .map((id) => byId.get(id))
    .filter((m) => m !== undefined)
    .slice(0, 12);
  if (top.length === 0) {
    return {
      content: refusalMessage({ kind: "insufficient_evidence" }, watchedNames),
      citations: null,
    };
  }

  const entityNames = new Map(watched.map((w) => [w.entityId, w.name]));
  const sheet = buildFactSheet(
    top.map((m) => ({ text: m.text, evidenceId: m.evidenceIds[0] ?? m.id })),
  );
  const result = await answerAsk.run(
    {
      question: parsed.rewrittenQuery,
      intent: parsed.intent,
      facts: sheet.facts.map((f, i) => ({
        ref: f.ref,
        text: f.text,
        date: top[i]!.date.toISOString().slice(0, 10),
        entity: entityNames.get(top[i]!.entityId) ?? null,
      })),
    },
    { orgId },
  );

  const content = result.blocks
    .map((b) => (b.heading ? `**${b.heading}**\n${b.text}` : b.text))
    .join("\n\n");
  const gaps = result.gaps ? `\n\n_Not covered by our evidence: ${result.gaps}_` : "";
  const evidenceByRef = new Map(sheet.facts.map((f) => [f.ref, f.evidenceId]));
  return {
    content: content + gaps,
    citations: {
      confidence: result.confidence,
      blocks: result.blocks.map((b) => ({
        refs: b.refs,
        evidenceIds: b.refs.map((r) => evidenceByRef.get(r)),
      })),
    },
  };
}
