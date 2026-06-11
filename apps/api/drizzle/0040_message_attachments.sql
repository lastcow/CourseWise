-- Optional single attachment per message (word/excel/pdf/code files),
-- referencing the existing file_assets storage. Additive.

DO $$ BEGIN
  ALTER TABLE "messages" ADD COLUMN "file_asset_id" uuid;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "messages" ADD CONSTRAINT "messages_file_asset_id_file_assets_id_fk"
    FOREIGN KEY ("file_asset_id") REFERENCES "file_assets"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
