-- Add a per-course banner image. Nullable FK to the existing file_assets
-- table; ON DELETE SET NULL so removing the underlying asset doesn't break
-- the course (the card falls back to a deterministic gradient instead).

ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "banner_file_asset_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "courses" ADD CONSTRAINT "courses_banner_file_asset_id_file_assets_id_fk"
   FOREIGN KEY ("banner_file_asset_id") REFERENCES "file_assets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
