-- Weighted scoring rule for assignment & quiz sets. Adds a third enum value
-- and a per-member weights map ({ [memberId]: weight }) on each set table.
-- Additive: existing 'average' / 'highest' sets are untouched; missing
-- weights default to 1 at compute time.

ALTER TYPE "assignment_set_rule" ADD VALUE IF NOT EXISTS 'weighted';
--> statement-breakpoint
ALTER TYPE "quiz_set_rule" ADD VALUE IF NOT EXISTS 'weighted';
--> statement-breakpoint
ALTER TABLE "assignment_sets" ADD COLUMN IF NOT EXISTS "weights_json" jsonb;
--> statement-breakpoint
ALTER TABLE "quiz_sets" ADD COLUMN IF NOT EXISTS "weights_json" jsonb;
