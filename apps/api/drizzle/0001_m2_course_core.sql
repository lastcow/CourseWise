-- M2 — Course Core schema additions.
-- All changes are additive. invitation_codes.course_id is relaxed to NULLABLE
-- so admin-issued global codes are possible (the seeded MGMT101 code still
-- holds a non-null courseId).

DO $$ BEGIN
 CREATE TYPE "public"."material_status" AS ENUM('draft', 'published', 'archived');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."material_source_type" AS ENUM('upload', 'external_link', 'manual_text');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."file_asset_status" AS ENUM('pending', 'ready', 'deleted');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "grading_policy_json" jsonb;
--> statement-breakpoint
ALTER TABLE "invitation_codes" ALTER COLUMN "course_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "file_assets" ADD COLUMN IF NOT EXISTS "course_id" uuid REFERENCES "courses"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "file_assets" ADD COLUMN IF NOT EXISTS "status" "file_asset_status" DEFAULT 'pending' NOT NULL;
--> statement-breakpoint
ALTER TABLE "file_assets" ADD COLUMN IF NOT EXISTS "related_type" text;
--> statement-breakpoint
ALTER TABLE "file_assets" ADD COLUMN IF NOT EXISTS "related_id" uuid;
--> statement-breakpoint
ALTER TABLE "file_assets" ADD COLUMN IF NOT EXISTS "etag" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "file_assets_course_idx" ON "file_assets" ("course_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "file_assets_status_idx" ON "file_assets" ("status");
--> statement-breakpoint
ALTER TABLE "reading_materials" ADD COLUMN IF NOT EXISTS "course_id" uuid;
--> statement-breakpoint
UPDATE "reading_materials" rm
  SET "course_id" = m."course_id"
  FROM "modules" m
  WHERE rm."module_id" = m."id" AND rm."course_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "reading_materials" ALTER COLUMN "course_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "reading_materials" ADD CONSTRAINT "reading_materials_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "reading_materials" DROP CONSTRAINT IF EXISTS "reading_materials_module_id_modules_id_fk";
--> statement-breakpoint
ALTER TABLE "reading_materials" ALTER COLUMN "module_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "reading_materials" ADD CONSTRAINT "reading_materials_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "reading_materials" ADD COLUMN IF NOT EXISTS "type" text DEFAULT 'document' NOT NULL;
--> statement-breakpoint
ALTER TABLE "reading_materials" ADD COLUMN IF NOT EXISTS "source_type" "material_source_type" DEFAULT 'manual_text' NOT NULL;
--> statement-breakpoint
ALTER TABLE "reading_materials" ADD COLUMN IF NOT EXISTS "external_url" text;
--> statement-breakpoint
ALTER TABLE "reading_materials" ADD COLUMN IF NOT EXISTS "status" "material_status" DEFAULT 'draft' NOT NULL;
--> statement-breakpoint
ALTER TABLE "reading_materials" ADD COLUMN IF NOT EXISTS "published_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "reading_materials" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "reading_materials" ADD COLUMN IF NOT EXISTS "created_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reading_materials_course_idx" ON "reading_materials" ("course_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reading_materials_status_idx" ON "reading_materials" ("status");
