import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";

import { classifyPageKind } from "@ayeastra/ai";
import {
  candidateUrls,
  detectFeeds,
  googleNewsRssUrl,
} from "@ayeastra/collection";
import { entities, getDb, sources } from "@ayeastra/db";
import { eq } from "drizzle-orm";

import { bootstrap, type Env } from "./env";

/**
 * source.discover (collection doc) — CF Workflow: common paths → page-kind
 * verification → feeds → news. EDGAR filings and app-store listings need a
 * CIK/app resolver and land later; discovery gaps stay visible on the
 * coverage page, never hidden.
 */

interface Params {
  entityId: string;
}

const UA = "AyeAstraBot/1.0 (+https://ayeastra.com/bot)";
const PREVIEW_CHARS = 2000;

export class SourceDiscoverWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep): Promise<void> {
    bootstrap(this.env);
    const { entityId } = event.payload;

    const entity = await step.do("load-entity", async () => {
      bootstrap(this.env);
      const [row] = await getDb()
        .select({ name: entities.canonicalName, domain: entities.domain })
        .from(entities)
        .where(eq(entities.id, entityId));
      if (!row) throw new Error(`entity ${entityId} not found`);
      return row;
    });
    if (!entity.domain) return; // nothing to crawl; news needs a domain qualifier too

    // 1) Probe common paths — candidates only, nothing trusted yet.
    const candidates = await step.do("probe-paths", async () => {
      const found: Array<{ url: string; kindHint: string; title: string | null; preview: string }> = [];
      for (const candidate of candidateUrls(entity.domain!)) {
        try {
          const res = await fetch(candidate.url, {
            headers: { "user-agent": UA },
            redirect: "follow",
          });
          if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) continue;
          const html = await res.text();
          found.push({
            url: candidate.url,
            kindHint: candidate.kindHint,
            title: /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? null,
            preview: html
              .replace(/<script[\s\S]*?<\/script>/gi, " ")
              .replace(/<style[\s\S]*?<\/style>/gi, " ")
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .slice(0, PREVIEW_CHARS),
          });
        } catch {
          // Unreachable path — skip; discovery is best-effort.
        }
      }
      return found;
    });

    // 2) Kind verification — only confident classifications become sources;
    //    if the model is unavailable the strong path prior stands in.
    await step.do("classify-and-persist", async () => {
      bootstrap(this.env);
      const db = getDb();
      for (const c of candidates) {
        let kind = c.kindHint;
        try {
          const out = await classifyPageKind.run(
            { url: c.url, title: c.title, contentPreview: c.preview },
            { entityId },
          );
          if (out.confidence === "low") {
            console.warn(`discovery: low-confidence page kind, skipped ${c.url} (hint: ${c.kindHint})`);
            continue;
          }
          kind = out.kind;
        } catch (err) {
          console.error(`classify-page-kind degraded to path prior for ${c.url}`, err);
        }
        await db
          .insert(sources)
          .values({
            entityId,
            url: c.url,
            kind: kind as typeof sources.$inferInsert.kind,
            discovery: "auto",
          })
          .onConflictDoNothing();
      }
    });

    // 3) Feeds — cheaper and more precise than page diffs where they exist.
    await step.do("feeds", async () => {
      bootstrap(this.env);
      const db = getDb();
      const homepage = candidates.find((c) => c.kindHint === "homepage");
      if (!homepage) return;
      const res = await fetch(homepage.url, { headers: { "user-agent": UA } });
      if (!res.ok) return;
      const feeds = detectFeeds(await res.text(), homepage.url);
      for (const url of feeds) {
        await db
          .insert(sources)
          .values({
            entityId,
            url,
            kind: /changelog|release/i.test(url) ? "changelog" : "blog",
            discovery: "auto",
          })
          .onConflictDoNothing();
      }
    });

    // 4) One news source per entity (Google News RSS).
    await step.do("news", async () => {
      bootstrap(this.env);
      await getDb()
        .insert(sources)
        .values({
          entityId,
          url: googleNewsRssUrl(entity.name, entity.domain!),
          kind: "news",
          discovery: "auto",
        })
        .onConflictDoNothing();
    });
  }
}
