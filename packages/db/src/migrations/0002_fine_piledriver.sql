ALTER TYPE "public"."action_source_type" ADD VALUE 'mission';--> statement-breakpoint
ALTER TYPE "public"."briefing_kind" ADD VALUE 'board';--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workos_org_id" text NOT NULL,
	"title" text NOT NULL,
	"layout" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "watch_spec" jsonb;--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "priority_id" text;--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "member_user_ids" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "brief" jsonb;--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "retrospective" jsonb;--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "closed_at" timestamp;--> statement-breakpoint
CREATE INDEX "reports_org_idx" ON "reports" USING btree ("workos_org_id","updated_at" DESC NULLS LAST);