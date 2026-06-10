-- Course schedule & module scheduling: weekly meeting slots + teacher-chosen
-- module cadence on courses; draft/published lifecycle, schedule window
-- (start_at/end_at) and manual-close timestamp on modules. Additive. Existing
-- modules are backfilled to 'published' so they stay visible to students —
-- only modules created after this migration start as drafts.

DO $$ BEGIN
 CREATE TYPE "module_cadence" AS ENUM ('session', 'daily', 'weekly', 'biweekly', 'monthly');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "module_status" AS ENUM ('draft', 'published');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "meeting_slots_json" jsonb;
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "module_cadence" "module_cadence";
--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN IF NOT EXISTS "status" "module_status" DEFAULT 'draft' NOT NULL;
--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN IF NOT EXISTS "published_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN IF NOT EXISTS "start_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN IF NOT EXISTS "end_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN IF NOT EXISTS "closed_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "modules" SET "status" = 'published', "published_at" = now() WHERE "status" = 'draft';
