-- Announcements M4: scheduled publish + a rolling in-app alert type.
--   announcements.publish_at: when status='scheduled', the cron sweep publishes
--     the announcement at/after this time.
--   alert_type 'announcement': one rolling open alert per student per course
--     (refreshed to the latest announcement), pointing at the feed.
DO $$ BEGIN
  ALTER TABLE "announcements" ADD COLUMN "publish_at" timestamp with time zone;
EXCEPTION
 WHEN duplicate_column THEN null;
END $$;
--> statement-breakpoint
ALTER TYPE "alert_type" ADD VALUE IF NOT EXISTS 'announcement';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "announcements_scheduled_publish_idx" ON "announcements" ("status", "publish_at");
