import { createHash } from "node:crypto";

import { and, eq, gt, notInArray } from "drizzle-orm";

import { getDb, kbArticles, kbChunks, type Database } from "@ayeastra/db";

/**
 * KB sync — markdown in packages/astra/kb is the source of truth, the DB is
 * a derived index. Idempotent by content hash: unchanged chunks are never
 * re-embedded, so a second run embeds zero. Pure helpers (parse/chunk/hash)
 * are exported for tests; syncKb takes the embed fn as a dependency.
 */

export interface KbFile {
  /** Raw markdown including `---` frontmatter (slug/title/category). */
  markdown: string;
}

export interface ParsedArticle {
  slug: string;
  title: string;
  category: string;
  body: string;
}

export function parseArticle(markdown: string): ParsedArticle {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error("kb article missing frontmatter");
  const fields: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx > 0) fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  const { slug, title, category } = fields;
  if (!slug || !title || !category) {
    throw new Error(`kb article frontmatter incomplete: ${JSON.stringify(fields)}`);
  }
  return { slug, title, category, body: match[2]!.trim() };
}

export interface ArticleChunk {
  position: number;
  heading: string | null;
  content: string;
}

/** Split at `##` headings; text before the first heading is chunk 0. */
export function chunkArticle(body: string): ArticleChunk[] {
  const parts = body.split(/\r?\n(?=## )/);
  const chunks: ArticleChunk[] = [];
  for (const part of parts) {
    const headingMatch = part.match(/^## (.+)\r?\n?([\s\S]*)$/);
    const heading = headingMatch ? headingMatch[1]!.trim() : null;
    const content = (headingMatch ? headingMatch[2]! : part).trim();
    if (!content && !heading) continue;
    chunks.push({ position: chunks.length, heading, content });
  }
  return chunks;
}

export const sha256 = (text: string) =>
  createHash("sha256").update(text).digest("hex");

/** Embedding input: heading gives the vector topical anchoring. */
const chunkText = (title: string, c: ArticleChunk) =>
  c.heading ? `${title} — ${c.heading}\n${c.content}` : `${title}\n${c.content}`;

export interface SyncResult {
  articles: number;
  embedded: number;
  unchanged: number;
  deletedArticles: number;
}

export async function syncKb(
  files: KbFile[],
  embedFn: (texts: string[]) => Promise<number[][]>,
  db: Database = getDb(),
  options: {
    /** Delete DB articles absent from `files`. Only the seed script (which
     * passes the complete kb/ directory) should turn this on. */
    prune?: boolean;
  } = {},
): Promise<SyncResult> {
  const parsed = files.map((f) => parseArticle(f.markdown));
  const slugs = parsed.map((p) => p.slug);
  if (new Set(slugs).size !== slugs.length) {
    throw new Error("kb: duplicate slugs across articles");
  }

  let embedded = 0;
  let unchanged = 0;

  for (const article of parsed) {
    const articleHash = sha256(article.body);
    await db
      .insert(kbArticles)
      .values({
        slug: article.slug,
        title: article.title,
        category: article.category,
        contentHash: articleHash,
      })
      .onConflictDoUpdate({
        target: kbArticles.slug,
        set: {
          title: article.title,
          category: article.category,
          contentHash: articleHash,
          updatedAt: new Date(),
        },
      });

    const chunks = chunkArticle(article.body);
    const existing = await db
      .select({
        position: kbChunks.position,
        contentHash: kbChunks.contentHash,
      })
      .from(kbChunks)
      .where(eq(kbChunks.articleSlug, article.slug));
    const existingHashByPos = new Map(
      existing.map((e) => [e.position, e.contentHash]),
    );

    const stale = chunks.filter(
      (c) => existingHashByPos.get(c.position) !== sha256(chunkText(article.title, c)),
    );
    unchanged += chunks.length - stale.length;

    if (stale.length > 0) {
      const vectors = await embedFn(
        stale.map((c) => chunkText(article.title, c)),
      );
      embedded += stale.length;
      for (let i = 0; i < stale.length; i++) {
        const c = stale[i]!;
        const values = {
          articleSlug: article.slug,
          position: c.position,
          heading: c.heading,
          content: c.content,
          contentHash: sha256(chunkText(article.title, c)),
          embedding: vectors[i]!,
        };
        await db
          .insert(kbChunks)
          .values(values)
          .onConflictDoUpdate({
            target: [kbChunks.articleSlug, kbChunks.position],
            set: values,
          });
      }
    }

    // Positions beyond the current chunk count are leftovers from a longer
    // previous version of the article.
    await db
      .delete(kbChunks)
      .where(
        and(
          eq(kbChunks.articleSlug, article.slug),
          gt(kbChunks.position, chunks.length - 1),
        ),
      );
  }

  // Articles removed from the filesystem disappear from the index too
  // (chunks cascade via the FK). Guarded: an accidentally empty file list
  // must never wipe the KB.
  let deletedArticles = 0;
  if (options.prune && slugs.length > 0) {
    const removed = await db
      .delete(kbArticles)
      .where(notInArray(kbArticles.slug, slugs))
      .returning({ slug: kbArticles.slug });
    deletedArticles = removed.length;
  }

  return { articles: parsed.length, embedded, unchanged, deletedArticles };
}
