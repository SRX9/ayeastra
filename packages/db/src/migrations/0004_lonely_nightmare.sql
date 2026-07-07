CREATE TABLE "kb_articles" (
	"slug" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"content_hash" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_chunks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"article_slug" text NOT NULL,
	"position" integer NOT NULL,
	"heading" text,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	CONSTRAINT "kb_chunks_article_slug_position_unique" UNIQUE("article_slug","position")
);
--> statement-breakpoint
ALTER TABLE "ask_messages" ADD COLUMN "parts" jsonb;--> statement-breakpoint
ALTER TABLE "kb_chunks" ADD CONSTRAINT "kb_chunks_article_slug_kb_articles_slug_fk" FOREIGN KEY ("article_slug") REFERENCES "public"."kb_articles"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kb_chunks_embedding_hnsw" ON "kb_chunks" USING hnsw ("embedding" vector_cosine_ops);