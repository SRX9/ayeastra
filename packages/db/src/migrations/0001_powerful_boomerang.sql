CREATE TYPE "public"."action_source_type" AS ENUM('signal', 'insight', 'briefing');--> statement-breakpoint
CREATE TYPE "public"."action_status" AS ENUM('open', 'done', 'dropped');--> statement-breakpoint
CREATE TYPE "public"."alias_source" AS ENUM('user', 'discovery', 'resolution');--> statement-breakpoint
CREATE TYPE "public"."ask_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."briefing_kind" AS ENUM('weekly', 'baseline', 'dossier');--> statement-breakpoint
CREATE TYPE "public"."briefing_status" AS ENUM('generating', 'qa_failed', 'ready', 'delivered');--> statement-breakpoint
CREATE TYPE "public"."confidence" AS ENUM('high', 'moderate', 'low');--> statement-breakpoint
CREATE TYPE "public"."cost_vendor" AS ENUM('firecrawl', 'anthropic', 'openai', 'cloudflare_email', 'r2', 'other', 'coresignal', 'theirstack', 'g2');--> statement-breakpoint
CREATE TYPE "public"."delivery_channel" AS ENUM('email', 'slack');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('queued', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."delivery_target_type" AS ENUM('alert', 'digest', 'briefing', 'insight');--> statement-breakpoint
CREATE TYPE "public"."deviation_kind" AS ENUM('burst', 'inflection', 'cohort');--> statement-breakpoint
CREATE TYPE "public"."entity_relation" AS ENUM('product_of', 'subsidiary_of', 'competes_in');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('company', 'product', 'market', 'person', 'vendor');--> statement-breakpoint
CREATE TYPE "public"."feedback_target_type" AS ENUM('signal', 'briefing_section', 'battlecard_section', 'ask_answer', 'insight');--> statement-breakpoint
CREATE TYPE "public"."feedback_verdict" AS ENUM('useful', 'not_useful', 'wrong', 'already_knew');--> statement-breakpoint
CREATE TYPE "public"."insight_kind" AS ENUM('correlation', 'deviation', 'pattern');--> statement-breakpoint
CREATE TYPE "public"."materiality" AS ENUM('cosmetic', 'content', 'material');--> statement-breakpoint
CREATE TYPE "public"."mission_status" AS ENUM('draft', 'active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."module_activation_source" AS ENUM('billing', 'manual');--> statement-breakpoint
CREATE TYPE "public"."module_key" AS ENUM('competitive_watch', 'product_market_watch');--> statement-breakpoint
CREATE TYPE "public"."org_entity_role" AS ENUM('competitor', 'self', 'market', 'vendor');--> statement-breakpoint
CREATE TYPE "public"."org_entity_tier" AS ENUM('primary', 'secondary', 'watch');--> statement-breakpoint
CREATE TYPE "public"."pattern_scope" AS ENUM('entity', 'industry', 'global');--> statement-breakpoint
CREATE TYPE "public"."pattern_source" AS ENUM('analyst', 'auto');--> statement-breakpoint
CREATE TYPE "public"."pattern_status" AS ENUM('candidate', 'validated', 'retired');--> statement-breakpoint
CREATE TYPE "public"."prediction_outcome" AS ENUM('pending', 'hit', 'miss');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('critical', 'high', 'notable', 'info');--> statement-breakpoint
CREATE TYPE "public"."signal_category" AS ENUM('pricing', 'packaging', 'launch', 'messaging', 'hiring', 'funding', 'partnership', 'regulatory', 'other', 'ma', 'market_entry', 'category_launch', 'platform_shift', 'narrative_shift', 'reviews');--> statement-breakpoint
CREATE TYPE "public"."signal_status" AS ENUM('new', 'acknowledged', 'dismissed', 'snoozed');--> statement-breakpoint
CREATE TYPE "public"."source_discovery" AS ENUM('auto', 'user');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('pricing', 'changelog', 'blog', 'docs', 'careers', 'news', 'filings', 'app_store', 'homepage', 'keyword_feed', 'hiring_data', 'review_data');--> statement-breakpoint
CREATE TYPE "public"."source_status" AS ENUM('ok', 'degraded', 'broken', 'retired');--> statement-breakpoint
CREATE TABLE "baseline_deviations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity_id" uuid NOT NULL,
	"category" "signal_category" NOT NULL,
	"kind" "deviation_kind" NOT NULL,
	"window_start" timestamp NOT NULL,
	"window_end" timestamp NOT NULL,
	"observed" integer NOT NULL,
	"expected" real NOT NULL,
	"p_value" double precision NOT NULL,
	"sigma_equiv" real NOT NULL,
	"stats" jsonb NOT NULL,
	"dedup_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "baseline_deviations_dedup_key_unique" UNIQUE("dedup_key")
);
--> statement-breakpoint
CREATE TABLE "pattern_predictions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pattern_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"fired_at" timestamp NOT NULL,
	"resolves_by" timestamp NOT NULL,
	"outcome" "prediction_outcome" DEFAULT 'pending' NOT NULL,
	"resolved_at" timestamp,
	"outcome_change_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pattern_predictions_pattern_id_entity_id_fired_at_unique" UNIQUE("pattern_id","entity_id","fired_at")
);
--> statement-breakpoint
CREATE TABLE "patterns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scope" "pattern_scope" NOT NULL,
	"entity_id" uuid,
	"claim" text NOT NULL,
	"trigger_spec" jsonb NOT NULL,
	"outcome_spec" jsonb NOT NULL,
	"spec_hash" text NOT NULL,
	"status" "pattern_status" DEFAULT 'candidate' NOT NULL,
	"source" "pattern_source" NOT NULL,
	"validation" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"retired_at" timestamp,
	CONSTRAINT "patterns_spec_hash_unique" UNIQUE("spec_hash")
);
--> statement-breakpoint
CREATE TABLE "changes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_id" uuid NOT NULL,
	"before_snapshot_id" uuid NOT NULL,
	"after_snapshot_id" uuid NOT NULL,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"materiality" "materiality" NOT NULL,
	"category" "signal_category",
	"extracted_facts" jsonb,
	"diff_r2_key" text,
	"embedding" vector(1536),
	"summary" text
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type" "entity_type" NOT NULL,
	"canonical_name" text NOT NULL,
	"domain" text,
	"description" text,
	"profile" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_aliases" (
	"entity_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"source" "alias_source" NOT NULL,
	CONSTRAINT "entity_aliases_alias_entity_id_unique" UNIQUE("alias","entity_id")
);
--> statement-breakpoint
CREATE TABLE "entity_relations" (
	"parent_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"relation" "entity_relation" NOT NULL,
	CONSTRAINT "entity_relations_parent_id_child_id_relation_unique" UNIQUE("parent_id","child_id","relation")
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"change_id" uuid,
	"source_url" text NOT NULL,
	"fetched_at" timestamp NOT NULL,
	"content_hash" text NOT NULL,
	"r2_keys" jsonb NOT NULL,
	"extracted" jsonb,
	"share_token" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_share_token_unique" UNIQUE("share_token")
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_id" uuid NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"content_hash" text NOT NULL,
	"r2_html_key" text NOT NULL,
	"r2_md_key" text NOT NULL,
	"r2_screenshot_key" text,
	"http_status" integer,
	"fetch_meta" jsonb
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity_id" uuid NOT NULL,
	"url" text NOT NULL,
	"kind" "source_kind" NOT NULL,
	"discovery" "source_discovery" NOT NULL,
	"status" "source_status" DEFAULT 'ok' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sources_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "actions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workos_org_id" text NOT NULL,
	"source_type" "action_source_type" NOT NULL,
	"source_id" uuid NOT NULL,
	"description" text NOT NULL,
	"owner_user_id" text,
	"status" "action_status" DEFAULT 'open' NOT NULL,
	"due_date" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ask_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"thread_id" uuid NOT NULL,
	"role" "ask_role" NOT NULL,
	"content" text NOT NULL,
	"citations" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ask_threads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workos_org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "battlecards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workos_org_id" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"sections" jsonb NOT NULL,
	"changelog" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "battlecards_workos_org_id_entity_id_unique" UNIQUE("workos_org_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "briefings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workos_org_id" text NOT NULL,
	"kind" "briefing_kind" NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" "briefing_status" DEFAULT 'generating' NOT NULL,
	"sections" jsonb,
	"context_version" integer NOT NULL,
	"rendered_r2_keys" jsonb,
	"delivered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_context" (
	"workos_org_id" text NOT NULL,
	"version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "business_context_workos_org_id_version_pk" PRIMARY KEY("workos_org_id","version")
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workos_org_id" text NOT NULL,
	"channel" "delivery_channel" NOT NULL,
	"target_type" "delivery_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"status" "delivery_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workos_org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"target_type" "feedback_target_type" NOT NULL,
	"target_id" text NOT NULL,
	"verdict" "feedback_verdict" NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insights" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workos_org_id" text NOT NULL,
	"kind" "insight_kind" DEFAULT 'correlation' NOT NULL,
	"entity_id" uuid NOT NULL,
	"signal_ids" uuid[] NOT NULL,
	"pattern_id" uuid,
	"prediction_id" uuid,
	"pattern" text NOT NULL,
	"analysis" text NOT NULL,
	"forward_look" text,
	"recommended_actions" jsonb,
	"confidence" "confidence" NOT NULL,
	"confidence_notes" text,
	"evidence_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"dedup_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "insights_workos_org_id_dedup_key_unique" UNIQUE("workos_org_id","dedup_key")
);
--> statement-breakpoint
CREATE TABLE "missions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workos_org_id" text NOT NULL,
	"goal" text NOT NULL,
	"entity_ids" uuid[] NOT NULL,
	"owner_user_id" text NOT NULL,
	"status" "mission_status" DEFAULT 'draft' NOT NULL,
	"kpis" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_entities" (
	"workos_org_id" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"role" "org_entity_role" NOT NULL,
	"tier" "org_entity_tier" DEFAULT 'primary' NOT NULL,
	"importance" smallint,
	"notes" text,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp,
	CONSTRAINT "org_entities_workos_org_id_entity_id_pk" PRIMARY KEY("workos_org_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "org_modules" (
	"workos_org_id" text NOT NULL,
	"module_key" "module_key" NOT NULL,
	"source" "module_activation_source" NOT NULL,
	"activated_at" timestamp DEFAULT now() NOT NULL,
	"deactivated_at" timestamp,
	CONSTRAINT "org_modules_workos_org_id_module_key_pk" PRIMARY KEY("workos_org_id","module_key")
);
--> statement-breakpoint
CREATE TABLE "org_scoring_weights" (
	"workos_org_id" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"category" "signal_category" NOT NULL,
	"multiplier" real DEFAULT 1 NOT NULL,
	"consecutive_negative" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "org_scoring_weights_workos_org_id_entity_id_category_pk" PRIMARY KEY("workos_org_id","entity_id","category")
);
--> statement-breakpoint
CREATE TABLE "outcomes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workos_org_id" text NOT NULL,
	"action_id" uuid NOT NULL,
	"kpi" text NOT NULL,
	"result" text NOT NULL,
	"evidence_ids" uuid[] NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workos_org_id" text NOT NULL,
	"change_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"category" "signal_category" NOT NULL,
	"module_key" "module_key" DEFAULT 'competitive_watch' NOT NULL,
	"severity" "severity" NOT NULL,
	"confidence" "confidence" NOT NULL,
	"finding" text NOT NULL,
	"why_it_matters" text NOT NULL,
	"recommended_action" text,
	"confidence_notes" text,
	"priority_attachments" jsonb,
	"context_version" integer NOT NULL,
	"scores" jsonb,
	"evidence_ids" uuid[] NOT NULL,
	"embedding" vector(1536),
	"dedup_key" text NOT NULL,
	"status" "signal_status" DEFAULT 'new' NOT NULL,
	"snoozed_until" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"at" timestamp DEFAULT now() NOT NULL,
	"vendor" "cost_vendor" NOT NULL,
	"task_name" text NOT NULL,
	"units" real NOT NULL,
	"cost_usd" numeric(10, 6) NOT NULL,
	"workos_org_id" text,
	"source_id" uuid,
	"job_run_id" text,
	"meta" jsonb
);
--> statement-breakpoint
CREATE TABLE "job_dead_letters" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"error" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "monitor_state" (
	"source_id" uuid PRIMARY KEY NOT NULL,
	"check_interval_minutes" integer NOT NULL,
	"next_check_at" timestamp NOT NULL,
	"last_change_at" timestamp,
	"change_rate_ewma" real DEFAULT 0 NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"pinned_interval_minutes" integer
);
--> statement-breakpoint
ALTER TABLE "baseline_deviations" ADD CONSTRAINT "baseline_deviations_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_predictions" ADD CONSTRAINT "pattern_predictions_pattern_id_patterns_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."patterns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_predictions" ADD CONSTRAINT "pattern_predictions_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_predictions" ADD CONSTRAINT "pattern_predictions_outcome_change_id_changes_id_fk" FOREIGN KEY ("outcome_change_id") REFERENCES "public"."changes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patterns" ADD CONSTRAINT "patterns_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changes" ADD CONSTRAINT "changes_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changes" ADD CONSTRAINT "changes_before_snapshot_id_snapshots_id_fk" FOREIGN KEY ("before_snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changes" ADD CONSTRAINT "changes_after_snapshot_id_snapshots_id_fk" FOREIGN KEY ("after_snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_aliases" ADD CONSTRAINT "entity_aliases_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_relations" ADD CONSTRAINT "entity_relations_parent_id_entities_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_relations" ADD CONSTRAINT "entity_relations_child_id_entities_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_change_id_changes_id_fk" FOREIGN KEY ("change_id") REFERENCES "public"."changes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_messages" ADD CONSTRAINT "ask_messages_thread_id_ask_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."ask_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battlecards" ADD CONSTRAINT "battlecards_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_pattern_id_patterns_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."patterns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_prediction_id_pattern_predictions_id_fk" FOREIGN KEY ("prediction_id") REFERENCES "public"."pattern_predictions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_entities" ADD CONSTRAINT "org_entities_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_scoring_weights" ADD CONSTRAINT "org_scoring_weights_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_change_id_changes_id_fk" FOREIGN KEY ("change_id") REFERENCES "public"."changes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitor_state" ADD CONSTRAINT "monitor_state_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "baseline_deviations_entity_idx" ON "baseline_deviations" USING btree ("entity_id","category","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "pattern_predictions_pending_idx" ON "pattern_predictions" USING btree ("outcome","resolves_by");--> statement-breakpoint
CREATE INDEX "patterns_status_idx" ON "patterns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "changes_source_detected_idx" ON "changes" USING btree ("source_id","detected_at");--> statement-breakpoint
CREATE INDEX "changes_embedding_hnsw" ON "changes" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "evidence_change_idx" ON "evidence" USING btree ("change_id");--> statement-breakpoint
CREATE INDEX "snapshots_source_fetched_idx" ON "snapshots" USING btree ("source_id","fetched_at");--> statement-breakpoint
CREATE INDEX "sources_entity_idx" ON "sources" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "actions_org_status_idx" ON "actions" USING btree ("workos_org_id","status");--> statement-breakpoint
CREATE INDEX "ask_messages_thread_idx" ON "ask_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "ask_threads_org_idx" ON "ask_threads" USING btree ("workos_org_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "briefings_org_period_idx" ON "briefings" USING btree ("workos_org_id","period_end" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "deliveries_org_target_idx" ON "deliveries" USING btree ("workos_org_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "feedback_org_target_idx" ON "feedback" USING btree ("workos_org_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "insights_org_created_idx" ON "insights" USING btree ("workos_org_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "missions_org_idx" ON "missions" USING btree ("workos_org_id","status");--> statement-breakpoint
CREATE INDEX "outcomes_org_idx" ON "outcomes" USING btree ("workos_org_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "signals_org_created_idx" ON "signals" USING btree ("workos_org_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "signals_org_entity_created_idx" ON "signals" USING btree ("workos_org_id","entity_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "signals_org_dedup_idx" ON "signals" USING btree ("workos_org_id","dedup_key");--> statement-breakpoint
CREATE INDEX "signals_embedding_hnsw" ON "signals" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "cost_events_at_idx" ON "cost_events" USING btree ("at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "cost_events_vendor_at_idx" ON "cost_events" USING btree ("vendor","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "monitor_state_next_check_idx" ON "monitor_state" USING btree ("next_check_at");