-- Course schedule window: start_date / end_date drive the time-based course
-- progress bar on the course home page (elapsed = today between start and end).
-- Both nullable and additive — existing courses simply have no dates (and
-- therefore no progress bar) until a teacher sets them.

ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "start_date" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "end_date" timestamp with time zone;
