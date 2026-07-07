import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

import { uuidv7 } from "../id";

/**
 * Platform knowledge base — curated product docs for AskAstra. Global layer:
 * NO org column (data-model law #3); the same articles serve every org.
 * Content lives in packages/astra/kb/*.md and is embedded by the idempotent
 * kb:seed script — the DB is a derived index, the markdown is the source of
 * truth.
 */

export const kbArticles = pgTable("kb_articles", {
  slug: text("slug").primaryKey(),
  title: text("title").notNull(),
  /** "features" | "concepts" | "account" — coarse filter for kb_search. */
  category: text("category").notNull(),
  /** sha256 of the full markdown — lets kb:seed skip unchanged articles. */
  contentHash: text("content_hash").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const kbChunks = pgTable(
  "kb_chunks",
  {
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    articleSlug: text("article_slug")
      .notNull()
      .references(() => kbArticles.slug, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    heading: text("heading"),
    content: text("content").notNull(),
    /** sha256 of the chunk — the skip-unchanged key for re-embedding. */
    contentHash: text("content_hash").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
  },
  (t) => [
    unique().on(t.articleSlug, t.position),
    index("kb_chunks_embedding_hnsw").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
  ],
);
