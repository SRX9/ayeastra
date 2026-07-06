CREATE TABLE "onboarding_state" (
	"workos_org_id" text PRIMARY KEY NOT NULL,
	"step" text NOT NULL,
	"draft" jsonb NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "meta" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "briefings_org_kind_period_uq" ON "briefings" USING btree ("workos_org_id","kind","period_start");