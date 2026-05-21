-- Scheduling fields for assignments and quizzes.
-- start_date / end_date gate when students can OPEN or START work; new
-- starts and new submissions are blocked outside that window.
-- until_date is the hard absolute deadline: any in-progress quiz attempt
-- has its expiresAt capped to min(startedAt + timeLimit, untilDate), and
-- any submission action after untilDate is refused.
--
-- All three columns are nullable so existing rows continue to work
-- unchanged. The legacy assignments.due_date column is left in place.

ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "start_date" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "end_date" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "until_date" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "until_date" timestamp with time zone;
