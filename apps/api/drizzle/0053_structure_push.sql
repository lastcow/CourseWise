-- One-way CW→Canvas structure push: new sync-run kind, module_item mapping
-- type, and an origin column on lms_id_map distinguishing import-minted
-- mappings (never pushed back) from push-minted ones (updated on re-push).
ALTER TYPE "lms_sync_run_kind" ADD VALUE IF NOT EXISTS 'structure_push';
--> statement-breakpoint
ALTER TYPE "lms_id_map_local_type" ADD VALUE IF NOT EXISTS 'module_item';
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lms_id_map" ADD COLUMN "origin" text;
EXCEPTION
 WHEN duplicate_column THEN null;
END $$;
--> statement-breakpoint
UPDATE "lms_id_map" SET "origin" = 'import' WHERE "origin" IS NULL;
