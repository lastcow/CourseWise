-- Course hard-delete bookkeeping.
--   course_deletion_log: append-only audit record of every successful course delete.
--     course_id intentionally has NO foreign key — the course row is gone by then.
--     child_counts (jsonb) snapshots the row counts wiped at delete time.
--   r2_cleanup_jobs: queue of pending/running R2 object purges per deleted course.
--     course_id is likewise orphan-tolerant.
--     Partial index on (status, created_at) covers the worker's scheduling query
--     while skipping terminal 'done' rows, which dominate the table over time.

DO $$ BEGIN
 CREATE TYPE "r2_cleanup_job_status" AS ENUM ('pending', 'running', 'done', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "course_deletion_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "course_id" uuid NOT NULL,
  "course_code" text NOT NULL,
  "course_title" text NOT NULL,
  "deleted_by" uuid NOT NULL,
  "deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "child_counts" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "r2_cleanup_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "course_id" uuid NOT NULL,
  "status" "r2_cleanup_job_status" DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "course_deletion_log" ADD CONSTRAINT "course_deletion_log_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "r2_cleanup_jobs_status_created_idx" ON "r2_cleanup_jobs" USING btree ("status","created_at") WHERE "status" IN ('pending', 'running', 'failed');
