import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { renderEmailHtml, renderEmailText, renderSlackDigest, type BriefingAst } from "@ayeastra/briefing";
import { currentContext } from "@ayeastra/core";
import {
  briefings,
  costEvents,
  deliveries,
  entities,
  getDb,
  insights,
  scopedDb,
  signals,
} from "@ayeastra/db";
import { CloudflareEmailProvider, type EmailProvider } from "@ayeastra/delivery";
import { defineJob, JOB_DEFAULTS } from "@ayeastra/jobs";

/**
 * delivery.send (alerts doc) — consumes deliveries rows; idempotency key
 * `deliver:{deliveryId}`; retries with backoff; exhausted → `failed` +
 * dead letter. Every email send emits a cost_events row (law #6).
 */

export const deliverySend = defineJob({
  name: "delivery.send",
  payload: z.object({ orgId: z.string().min(1), deliveryId: z.uuid() }),
  idempotencyKey: (p) => `deliver:${p.deliveryId}`,
  run: async (payload, ctx) => {
    const db = getDb();
    const scoped = scopedDb(payload.orgId, db);
    const [delivery] = await scoped.select(deliveries, eq(deliveries.id, payload.deliveryId));
    if (!delivery || delivery.status === "sent") return; // replay is a no-op
    const context = await currentContext(scoped);
    if (!context) return;
    const channels = context.payload.delivery.channels;

    const content = await buildContent(db, scoped, delivery);
    if (!content) {
      await scoped.update(deliveries, { status: "failed" }, eq(deliveries.id, delivery.id));
      return;
    }

    try {
      if (delivery.channel === "email") {
        if (channels.email.length === 0) throw new Error("no email recipients configured");
        await emailProvider().send({
          to: channels.email,
          from: process.env.EMAIL_FROM ?? "intel@ayeastra.com",
          subject: content.subject,
          html: content.html,
          text: content.text,
        });
        await db.insert(costEvents).values({
          vendor: "cloudflare_email",
          taskName: "delivery.send",
          units: channels.email.length,
          costUsd: "0",
          workosOrgId: payload.orgId,
          jobRunId: ctx.jobRunId,
          meta: { deliveryId: delivery.id, estimate: true },
        });
      } else {
        if (!channels.slackWebhook) throw new Error("no Slack webhook configured");
        const res = await fetch(channels.slackWebhook, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(content.slack),
        });
        if (!res.ok) throw new Error(`slack webhook: HTTP ${res.status} ${await res.text()}`);
      }
    } catch (err) {
      const attempts = delivery.attempts + 1;
      await scoped.update(
        deliveries,
        {
          attempts,
          // Exhausted → visible failure state (Settings surfaces it); the
          // adapter's dead-letter writer records payload + error.
          ...(ctx.attempt >= JOB_DEFAULTS.maxAttempts ? { status: "failed" as const } : {}),
        },
        eq(deliveries.id, delivery.id),
      );
      throw err;
    }

    await scoped.update(
      deliveries,
      { status: "sent", attempts: delivery.attempts + 1, sentAt: new Date() },
      eq(deliveries.id, delivery.id),
    );
    if (delivery.targetType === "briefing") {
      await scoped.update(
        briefings,
        { status: "delivered", deliveredAt: new Date() },
        eq(briefings.id, delivery.targetId),
      );
    }
  },
});

let _email: EmailProvider | undefined;
function emailProvider(): EmailProvider {
  if (!_email) {
    _email = new CloudflareEmailProvider(
      process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
      process.env.CLOUDFLARE_EMAIL_API_TOKEN ?? process.env.CLOUDFLARE_API_TOKEN ?? "",
    );
  }
  return _email;
}

interface Content {
  subject: string;
  html: string;
  text: string;
  slack: unknown;
}

async function buildContent(
  db: ReturnType<typeof getDb>,
  scoped: ReturnType<typeof scopedDb>,
  delivery: typeof deliveries.$inferSelect,
): Promise<Content | null> {
  const webUrl = process.env.WEB_URL ?? process.env.NEXT_PUBLIC_SERVER_URL ?? "";

  if (delivery.targetType === "briefing") {
    const [row] = await scoped.select(briefings, eq(briefings.id, delivery.targetId));
    if (!row?.sections) return null;
    const ast = row.sections as unknown as BriefingAst;
    return {
      subject: `${ast.orgName} — ${ast.kind === "baseline" ? "Baseline Dossier" : "Competitive Briefing"} (${ast.periodLabel})`,
      html: renderEmailHtml(ast),
      text: renderEmailText(ast),
      slack: renderSlackDigest(ast),
    };
  }

  if (delivery.targetType === "alert") {
    const [signal] = await scoped.select(signals, eq(signals.id, delivery.targetId));
    if (!signal) return null;
    const entity = await entityName(db, signal.entityId);
    const link = `${webUrl}/dashboard`;
    const line = `${entity}: ${signal.finding}`;
    return {
      subject: `[${signal.severity.toUpperCase()}] ${line}`,
      html: alertHtml(signal.severity, entity, signal.finding, signal.whyItMatters, signal.recommendedAction, link),
      text: `[${signal.severity.toUpperCase()}] ${line}\n\nWhy it matters: ${signal.whyItMatters}\n${signal.recommendedAction ? `Recommended: ${signal.recommendedAction}\n` : ""}${link}`,
      slack: {
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: `*[${signal.severity.toUpperCase()}]* ${esc(line)}` },
          },
          { type: "section", text: { type: "mrkdwn", text: `*Why it matters:* ${esc(signal.whyItMatters)}` } },
          ...(signal.recommendedAction
            ? [{ type: "section", text: { type: "mrkdwn", text: `*Recommended:* ${esc(signal.recommendedAction)}` } }]
            : []),
          { type: "context", elements: [{ type: "mrkdwn", text: `<${link}|Open in AyeAstra>` }] },
        ],
      },
    };
  }

  if (delivery.targetType === "digest") {
    const meta = delivery.meta as { day?: string; signalIds?: string[] } | null;
    const ids = meta?.signalIds ?? [];
    if (ids.length === 0) return null;
    const rows = await scoped.select(signals, inArray(signals.id, ids));
    const names = new Map<string, string>();
    for (const s of rows) {
      if (!names.has(s.entityId)) names.set(s.entityId, await entityName(db, s.entityId));
    }
    const items = rows.map((s) => ({
      entity: names.get(s.entityId) ?? "Unknown",
      finding: s.finding,
      whyItMatters: s.whyItMatters,
    }));
    const day = meta?.day ?? new Date().toISOString().slice(0, 10);
    return {
      subject: `Daily intelligence digest — ${day} (${items.length} notable)`,
      html: digestHtml(day, items, `${webUrl}/dashboard`),
      text: items.map((i) => `• ${i.entity}: ${i.finding}\n  ${i.whyItMatters}`).join("\n"),
      slack: {
        blocks: [
          { type: "header", text: { type: "plain_text", text: `Daily digest — ${day}` } },
          ...items.slice(0, 20).map((i) => ({
            type: "section",
            text: { type: "mrkdwn", text: `*${esc(i.entity)}*: ${esc(i.finding)}\n_${esc(i.whyItMatters)}_` },
          })),
        ],
      },
    };
  }

  // insight — validated-pattern / correlation alert.
  const [insight] = await scoped.select(insights, eq(insights.id, delivery.targetId));
  if (!insight) return null;
  const entity = await entityName(db, insight.entityId);
  const link = `${webUrl}/dashboard`;
  return {
    subject: `Connected intelligence: ${entity} — ${insight.pattern}`,
    html: alertHtml("critical", entity, insight.pattern, insight.analysis, insight.forwardLook, link),
    text: `${entity}: ${insight.pattern}\n\n${insight.analysis}\n${insight.forwardLook ?? ""}\n${link}`,
    slack: {
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `*Connected intelligence:* ${esc(entity)} — ${esc(insight.pattern)}` } },
        { type: "section", text: { type: "mrkdwn", text: esc(insight.analysis) } },
        { type: "context", elements: [{ type: "mrkdwn", text: `<${link}|Open in AyeAstra>` }] },
      ],
    },
  };
}

async function entityName(db: ReturnType<typeof getDb>, entityId: string): Promise<string> {
  const [row] = await db
    .select({ name: entities.canonicalName })
    .from(entities)
    .where(eq(entities.id, entityId));
  return row?.name ?? "Unknown";
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#d4380d",
  high: "#d48806",
  notable: "#1677ff",
  info: "#8c8c8c",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function alertHtml(
  severity: string,
  entity: string,
  finding: string,
  why: string,
  recommended: string | null,
  link: string,
): string {
  const color = SEVERITY_COLOR[severity] ?? "#8c8c8c";
  return `<!doctype html><html><body style="font-family:ui-sans-serif,system-ui,sans-serif;color:#111;margin:24px">
<span style="background:${color};color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;text-transform:uppercase">${esc(severity)}</span>
<h2 style="margin:12px 0 4px">${esc(entity)}</h2>
<p style="margin:4px 0 12px;font-size:15px">${esc(finding)}</p>
<p style="margin:0 0 8px;color:#444"><strong>Why it matters:</strong> ${esc(why)}</p>
${recommended ? `<p style="margin:0 0 8px;color:#444"><strong>Recommended:</strong> ${esc(recommended)}</p>` : ""}
<p style="margin:16px 0 0"><a href="${esc(link)}" style="color:#1677ff">Open in AyeAstra</a></p>
</body></html>`;
}

function digestHtml(
  day: string,
  items: Array<{ entity: string; finding: string; whyItMatters: string }>,
  link: string,
): string {
  const byEntity = new Map<string, typeof items>();
  for (const i of items) {
    byEntity.set(i.entity, [...(byEntity.get(i.entity) ?? []), i]);
  }
  const groups = [...byEntity.entries()]
    .map(
      ([entity, list]) =>
        `<h3 style="margin:16px 0 4px">${esc(entity)}</h3>` +
        list
          .map(
            (i) =>
              `<p style="margin:4px 0"><strong>${esc(i.finding)}</strong><br><span style="color:#555">${esc(i.whyItMatters)}</span></p>`,
          )
          .join(""),
    )
    .join("");
  return `<!doctype html><html><body style="font-family:ui-sans-serif,system-ui,sans-serif;color:#111;margin:24px">
<h2 style="margin:0 0 4px">Daily intelligence digest</h2>
<p style="color:#555;margin:0 0 8px">${esc(day)} — ${items.length} notable signal${items.length === 1 ? "" : "s"}</p>
${groups}
<p style="margin:16px 0 0"><a href="${esc(link)}" style="color:#1677ff">Open in AyeAstra</a></p>
</body></html>`;
}
