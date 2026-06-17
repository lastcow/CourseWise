-- Announcements: priority (normal/high/urgent), mirroring messaging. Drives
-- list ordering (urgent first), a visual badge, and the fan-out alert severity.
DO $$ BEGIN
  ALTER TABLE "announcements" ADD COLUMN "priority" text DEFAULT 'normal' NOT NULL;
EXCEPTION
 WHEN duplicate_column THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "announcements" ADD CONSTRAINT "announcements_priority_check" CHECK ("priority" IN ('normal', 'high', 'urgent'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
