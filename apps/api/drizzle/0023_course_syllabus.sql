-- Per-course syllabus: a long markdown blob authored by the teacher and an
-- optional PDF attachment served via the existing file_assets / R2 pipeline.

ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "syllabus_md" text;
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "syllabus_file_asset_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "courses" ADD CONSTRAINT "courses_syllabus_file_asset_id_file_assets_id_fk"
   FOREIGN KEY ("syllabus_file_asset_id") REFERENCES "file_assets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
