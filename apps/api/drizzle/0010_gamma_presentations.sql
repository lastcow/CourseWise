ALTER TABLE "presentations"
  ADD COLUMN IF NOT EXISTS "external_url" text;
--> statement-breakpoint
ALTER TABLE "presentations"
  ADD COLUMN IF NOT EXISTS "provider" text;
--> statement-breakpoint
ALTER TABLE "presentations"
  ADD COLUMN IF NOT EXISTS "file_asset_id" uuid;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "presentations"
    ADD CONSTRAINT "presentations_file_asset_id_fkey"
    FOREIGN KEY ("file_asset_id") REFERENCES "file_assets"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "gamma_job_status" AS ENUM ('pending', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "gamma_generation_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "course_id" uuid NOT NULL,
  "presentation_id" uuid,
  "requested_by_id" uuid,
  "status" "gamma_job_status" NOT NULL DEFAULT 'pending',
  "gamma_generation_id" text,
  "gamma_url" text,
  "export_url" text,
  "error_message" text,
  "material_ids" uuid[] NOT NULL,
  "request_params" jsonb NOT NULL,
  "credits_deducted" integer,
  "credits_remaining" integer,
  "last_polled_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "gamma_generation_jobs"
    ADD CONSTRAINT "gamma_generation_jobs_course_id_fkey"
    FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "gamma_generation_jobs"
    ADD CONSTRAINT "gamma_generation_jobs_presentation_id_fkey"
    FOREIGN KEY ("presentation_id") REFERENCES "presentations"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "gamma_generation_jobs"
    ADD CONSTRAINT "gamma_generation_jobs_requested_by_id_fkey"
    FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "gamma_generation_jobs_course_idx"
  ON "gamma_generation_jobs" ("course_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gamma_generation_jobs_status_idx"
  ON "gamma_generation_jobs" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gamma_generation_jobs_presentation_idx"
  ON "gamma_generation_jobs" ("presentation_id");
