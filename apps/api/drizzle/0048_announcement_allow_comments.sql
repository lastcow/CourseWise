-- Announcements: per-announcement toggle for whether students may comment.
-- Defaults true (existing behavior); when false, new comments are rejected but
-- any existing comments stay visible (read-only).
DO $$ BEGIN
  ALTER TABLE "announcements" ADD COLUMN "allow_comments" boolean DEFAULT true NOT NULL;
EXCEPTION
 WHEN duplicate_column THEN null;
END $$;
