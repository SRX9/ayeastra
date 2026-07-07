-- Collapse pre-constraint duplicate votes, keeping the newest per
-- (org, user, target) — ids are uuidv7, so the max id is the latest vote.
DELETE FROM "feedback" a USING "feedback" b
WHERE a."workos_org_id" = b."workos_org_id"
  AND a."user_id" = b."user_id"
  AND a."target_type" = b."target_type"
  AND a."target_id" = b."target_id"
  AND a."id" < b."id";--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_target_unique" UNIQUE("workos_org_id","user_id","target_type","target_id");
