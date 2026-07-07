import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { and, count, eq, gte } from "drizzle-orm";
import { z } from "zod";

import { costUsd, isLlmConfigured } from "@ayeastra/ai";
import { recordTaskRun } from "@ayeastra/ai/tracing";
import { appendMessage, createThread, getMessages } from "@ayeastra/ask";
import {
  buildAmbient,
  buildSystemPrompt,
  buildToolset,
  chatModel,
  CHAT_TIER,
  defaultSources,
  listActiveModules,
  listWatched,
  pageHint,
  type AstraContext,
} from "@ayeastra/astra";
import { askMessages, askThreads, getDb, scopedDb } from "@ayeastra/db";
import { uuidv7 } from "@ayeastra/db/id";
import { getWorkOS, withAuth } from "@workos-inc/authkit-nextjs";

import { extractCitations, extractText, toUIMessages } from "@/lib/astra";

/**
 * Astra chat transport — "the streaming route replaces the transport, not
 * the pipeline" (ask doc). Auth and org scoping happen here; everything the
 * model can reach goes through the source registry's scoped tools. History
 * is server-loaded from ask threads; the client only ever sends its latest
 * message.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const MESSAGES_PER_HOUR = 30;
const THREAD_ID_HEADER = "X-Astra-Thread-Id";

const Body = z.object({
  threadId: z.uuid().optional(),
  pathname: z.string().max(200).optional(),
  message: z.object({
    id: z.string(),
    role: z.literal("user"),
    parts: z.array(z.looseObject({ type: z.string() })),
  }),
});

const EMPTY_ANSWER_FALLBACK =
  "I couldn't finish putting an answer together — please ask again, ideally a bit more narrowly.";

const UNCONFIGURED_NOTICE =
  "The AI engine isn't configured yet (LLM credentials pending), so I can't answer — your question is saved and the archive keeps collecting.";

export async function POST(request: Request) {
  const session = await withAuth();
  if (!session.user) return new Response("Unauthorized", { status: 401 });
  const orgId = session.organizationId;
  if (!orgId) return new Response("No organization", { status: 403 });

  // Mirror requireActiveSubscription without its redirect — route handlers
  // answer with status codes the client can render.
  const organization = await getWorkOS().organizations.getOrganization(orgId);
  const plan = organization.metadata.plan;
  if (!plan || plan === "none") {
    return Response.json(
      { error: "subscription_required" },
      { status: 402 },
    );
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const message = parsed.data.message as unknown as UIMessage;
  const text = extractText(message);
  if (!text || text.length > 2000) {
    return new Response("Bad request", { status: 400 });
  }

  const db = getDb();
  const scoped = scopedDb(orgId, db);
  const userId = session.user.id;

  // DB-backed rate limit: user messages across the user's threads, last hour.
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [rate] = await db
    .select({ n: count() })
    .from(askMessages)
    .innerJoin(askThreads, eq(askMessages.threadId, askThreads.id))
    .where(
      and(
        scoped.scope(askThreads),
        eq(askThreads.userId, userId),
        eq(askMessages.role, "user"),
        gte(askMessages.createdAt, hourAgo),
      ),
    );
  if ((rate?.n ?? 0) >= MESSAGES_PER_HOUR) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  // Thread: create on first message; ownership asserted on every access.
  const threadId =
    parsed.data.threadId ??
    (await createThread(scoped, userId, text.slice(0, 80)));
  const history = await getMessages(scoped, threadId, db);
  await appendMessage(
    scoped,
    threadId,
    "user",
    text,
    undefined,
    { parts: message.parts },
    db,
  );

  const headers = { [THREAD_ID_HEADER]: threadId };

  if (!isLlmConfigured()) {
    await appendMessage(scoped, threadId, "assistant", UNCONFIGURED_NOTICE, undefined, undefined, db);
    const stream = createUIMessageStream({
      execute({ writer }) {
        writer.write({ type: "text-start", id: "notice" });
        writer.write({ type: "text-delta", id: "notice", delta: UNCONFIGURED_NOTICE });
        writer.write({ type: "text-end", id: "notice" });
      },
    });
    return createUIMessageStreamResponse({ stream, headers });
  }

  const ctx: AstraContext = {
    scoped,
    userId,
    orgName: organization.name,
    pathname: parsed.data.pathname,
    runCtx: { orgId },
  };
  const [{ tools, sourceInventory }, ambient, watched, activeModules] =
    await Promise.all([
      Promise.resolve(buildToolset(defaultSources, ctx)),
      buildAmbient(defaultSources, ctx),
      listWatched(scoped, db),
      listActiveModules(scoped),
    ]);

  const { model, modelId } = chatModel();
  const startedAt = new Date();
  const result = streamText({
    model,
    system: buildSystemPrompt({
      orgName: organization.name,
      watchedNames: watched.map((w) => w.name),
      activeModules,
      sourceInventory,
      ambient,
      pageHint: pageHint(parsed.data.pathname),
      today: new Date().toISOString().slice(0, 10),
    }),
    messages: convertToModelMessages(
      [...toUIMessages(history as never), message],
      { tools, ignoreIncompleteToolCalls: true },
    ),
    tools,
    stopWhen: stepCountIs(6),
    onFinish: async ({ totalUsage, steps }) => {
      // Same telemetry contract as every defineTask run: one Langfuse
      // generation + one cost_events row per turn. Never fails the response.
      const inputTokens = totalUsage.inputTokens ?? 0;
      const outputTokens = totalUsage.outputTokens ?? 0;
      const cost = costUsd(modelId, inputTokens, outputTokens);
      await recordTaskRun({
        taskName: "astra.chat",
        tier: CHAT_TIER,
        model: modelId,
        ctx: { orgId },
        input: { threadId, chars: text.length },
        output: { steps: steps.length },
        usage: { inputTokens, outputTokens },
        costUsd: cost.usd,
        priced: cost.priced,
        attempts: 1,
        startedAt,
      });
    },
  });

  // Pre-minted so the client's message id matches the persisted row —
  // feedback rows then reference a real ask_messages id.
  const assistantId = uuidv7();
  const response = result.toUIMessageStreamResponse({
    headers,
    generateMessageId: () => assistantId,
    onError: () =>
      "Something went wrong while answering — please try again.",
    onFinish: async ({ responseMessage }) => {
      const answerText = extractText(responseMessage);
      // A turn can end on the step budget with tool parts but no final text;
      // persist a visible fallback instead of an empty bubble.
      const content = answerText || EMPTY_ANSWER_FALLBACK;
      const parts = answerText
        ? responseMessage.parts
        : [
            ...responseMessage.parts,
            { type: "text" as const, text: EMPTY_ANSWER_FALLBACK },
          ];
      await appendMessage(
        scoped,
        threadId,
        "assistant",
        content,
        extractCitations(answerText),
        { parts, id: assistantId },
        db,
      );
    },
  });
  // Keep generating server-side even if the client disconnects mid-stream —
  // otherwise neither onFinish runs: the answer is never persisted and the
  // spend never reaches cost_events.
  void result.consumeStream();
  return response;
}
