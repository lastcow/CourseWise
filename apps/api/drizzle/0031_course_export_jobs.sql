-- Course export jobs: async ZIP export (reading materials + gradable items +
-- submissions + scores) requested by a teacher, built on the backend into R2,
-- then emailed as an authenticated download link. Additive — new table + enum.

DO $$ BEGIN
 CREATE TYPE "course_export_status" AS ENUM ('pending', 'running', 'done', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "course_export_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "course_id" uuid NOT NULL,
  "requested_by_id" uuid,
  "status" "course_export_status" DEFAULT 'pending' NOT NULL,
  "object_key" text,
  "size_bytes" integer,
  "error" text,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "course_export_jobs" ADD CONSTRAINT "course_export_jobs_course_id_fkey"
   FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "course_export_jobs" ADD CONSTRAINT "course_export_jobs_requested_by_id_fkey"
   FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "course_export_jobs_course_created_idx" ON "course_export_jobs" ("course_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "course_export_jobs_expires_idx" ON "course_export_jobs" ("expires_at") WHERE "status" = 'done';
