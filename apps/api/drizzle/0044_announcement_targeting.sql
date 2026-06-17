-- Announcements M2: pin, attachments, and targeted group audience.
--   announcements.pinned: bubble important announcements to the top.
--   announcements.audience: 'course' (all enrolled) or 'groups' (only members
--     of the groups in announcement_targets).
--   announcement_attachments: optional file_assets attached to an announcement.
DO $$ BEGIN
  CREATE TYPE "announcement_audience" AS ENUM ('course', 'groups');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "announcements" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;
EXCEPTION
 WHEN duplicate_column THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "announcements" ADD COLUMN "audience" "announcement_audience" DEFAULT 'course' NOT NULL;
EXCEPTION
 WHEN duplicate_column THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "announcement_targets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "announcement_id" uuid NOT NULL,
  "group_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "announcement_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "announcement_id" uuid NOT NULL,
  "file_asset_id" uuid,
  "position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcement_targets" ADD CONSTRAINT "announcement_targets_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcement_targets" ADD CONSTRAINT "announcement_targets_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcement_attachments" ADD CONSTRAINT "announcement_attachments_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcement_attachments" ADD CONSTRAINT "announcement_attachments_file_asset_id_file_assets_id_fk" FOREIGN KEY ("file_asset_id") REFERENCES "file_assets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "announcement_targets_announcement_idx" ON "announcement_targets" ("announcement_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "announcement_targets_announcement_group_idx" ON "announcement_targets" ("announcement_id", "group_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "announcement_attachments_announcement_idx" ON "announcement_attachments" ("announcement_id");
