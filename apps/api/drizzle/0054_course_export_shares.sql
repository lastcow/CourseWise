-- Capability share links for a completed course export: a teacher mints a
-- high-entropy token (stored hashed) that lets someone without a CourseWise
-- account download the export ZIP. Time-boxed, download-capped, revocable,
-- optionally passphrase-protected, audited on every guest download.
CREATE TABLE IF NOT EXISTS "course_export_shares" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "export_job_id" uuid NOT NULL,
  "course_id" uuid NOT NULL,
  "created_by_id" uuid,
  "token_hash" text NOT NULL,
  "passphrase_hash" text,
  "expires_at" timestamp with time zone NOT NULL,
  "max_downloads" integer DEFAULT 10 NOT NULL,
  "download_count" integer DEFAULT 0 NOT NULL,
  "failed_attempts" integer DEFAULT 0 NOT NULL,
  "locked_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "last_downloaded_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "course_export_shares" ADD CONSTRAINT "course_export_shares_export_job_id_fkey"
   FOREIGN KEY ("export_job_id") REFERENCES "course_export_jobs"("id") ON DELETE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "course_export_shares" ADD CONSTRAINT "course_export_shares_course_id_fkey"
   FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "course_export_shares" ADD CONSTRAINT "course_export_shares_created_by_id_fkey"
   FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "course_export_shares_token_hash_idx" ON "course_export_shares" ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "course_export_shares_export_job_idx" ON "course_export_shares" ("export_job_id");
