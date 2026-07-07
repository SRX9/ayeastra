import { asc, cosineDistance, desc, eq, sql } from "drizzle-orm";

import { getDb, kbArticles, kbChunks, type Database } from "@ayeastra/db";

/**
 * Platform KB retrieval — global product docs, intentionally unscoped
 * (same articles serve every org). Vector search over kb_chunks mirrors
 * the ask retrieval pattern: cosine similarity, HNSW index.
 */

export interface KbHit {
  articleSlug: string;
  articleTitle: string;
  category: string;
  heading: string | null;
  content: string;
  score: number;
}

export async function searchKb(
  embedding: number[],
  category?: string,
  k = 5,
  db: Database = getDb(),
): Promise<KbHit[]> {
  const similarity = sql<number>`1 - (${cosineDistance(kbChunks.embedding, embedding)})`;
  const rows = await db
    .select({
      articleSlug: kbChunks.articleSlug,
      articleTitle: kbArticles.title,
      category: kbArticles.category,
      heading: kbChunks.heading,
      content: kbChunks.content,
      score: similarity,
    })
    .from(kbChunks)
    .innerJoin(kbArticles, eq(kbChunks.articleSlug, kbArticles.slug))
    .where(category ? eq(kbArticles.category, category) : undefined)
    .orderBy(desc(similarity))
    .limit(k);
  return rows.map((r) => ({ ...r, score: Number(r.score) }));
}

export async function getKbArticle(
  slug: string,
  db: Database = getDb(),
): Promise<{ slug: string; title: string; content: string } | null> {
  const [article] = await db
    .select()
    .from(kbArticles)
    .where(eq(kbArticles.slug, slug));
  if (!article) return null;
  const chunks = await db
    .select({ heading: kbChunks.heading, content: kbChunks.content })
    .from(kbChunks)
    .where(eq(kbChunks.articleSlug, slug))
    .orderBy(asc(kbChunks.position));
  const content = chunks
    .map((c) => (c.heading ? `## ${c.heading}\n\n${c.content}` : c.content))
    .join("\n\n");
  return { slug: article.slug, title: article.title, content };
}

export async function listKbArticles(db: Database = getDb()) {
  return db
    .select({
      slug: kbArticles.slug,
      title: kbArticles.title,
      category: kbArticles.category,
    })
    .from(kbArticles)
    .orderBy(asc(kbArticles.category), asc(kbArticles.slug));
}
