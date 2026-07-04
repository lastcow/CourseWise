-- Canvas LMS sync core tables (import-first, docs/plans/2026-07-04-canvas-sync-v2).
-- lms_connections: one per teacher, AES-GCM-encrypted personal access token.
-- lms_course_links: CW course <-> external Canvas course.
-- lms_roster_entries: read-only roster reference snapshot (zero FKs to users).
-- lms_id_map: import provenance + confirmed student identity links.
-- lms_sync_runs: workflow job rows (202 + poll).
DO $$ BEGIN
 CREATE TYPE "lms_provider" AS ENUM ('canvas');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "lms_connection_status" AS ENUM ('active', 'expired', 'revoked', 'invalid', 'error');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "lms_sync_run_kind" AS ENUM ('initial_import', 'roster_refresh', 'grade_export');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "lms_sync_run_status" AS ENUM ('pending', 'running', 'done', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "lms_id_map_local_type" AS ENUM ('student_link', 'assignment', 'assignment_group', 'module', 'pushed_assignment_column', 'final_grade_column');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "lms_match_method" AS ENUM ('sis', 'email', 'login_id', 'claim', 'name_suggestion', 'manual');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lms_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "provider" "lms_provider" DEFAULT 'canvas' NOT NULL,
  "teacher_id" uuid NOT NULL,
  "base_url" text NOT NULL,
  "external_user_id" text,
  "external_user_name" text,
  "token_enc" text NOT NULL,
  "token_last4" text NOT NULL,
  "token_expires_at" timestamp with time zone,
  "status" "lms_connection_status" DEFAULT 'active' NOT NULL,
  "last_validated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lms_course_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "connection_id" uuid NOT NULL,
  "course_id" uuid NOT NULL,
  "external_course_id" text NOT NULL,
  "external_course_name" text,
  "external_course_code" text,
  "imported_at" timestamp with time zone,
  "import_run_id" uuid,
  "roster_refresh_enabled" boolean DEFAULT false NOT NULL,
  "roster_refresh_until" timestamp with time zone,
  "last_roster_fetch_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lms_roster_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "course_link_id" uuid NOT NULL,
  "canvas_user_id" text NOT NULL,
  "name" text NOT NULL,
  "sortable_name" text,
  "email" text,
  "login_id" text,
  "sis_user_id" text,
  "enrollment_state" text,
  "section_names" jsonb,
  "fingerprint" text NOT NULL,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "disappeared_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lms_id_map" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "course_link_id" uuid NOT NULL,
  "local_type" "lms_id_map_local_type" NOT NULL,
  "local_id" uuid NOT NULL,
  "external_id" text NOT NULL,
  "last_synced_fingerprint" text,
  "synced_at" timestamp with time zone,
  "match_method" "lms_match_method",
  "confirmed_by_user_id" uuid,
  "confirmed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lms_sync_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "connection_id" uuid NOT NULL,
  "course_link_id" uuid,
  "kind" "lms_sync_run_kind" NOT NULL,
  "status" "lms_sync_run_status" DEFAULT 'pending' NOT NULL,
  "requested_by_id" uuid,
  "summary_json" jsonb,
  "error" text,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lms_connections" ADD CONSTRAINT "lms_connections_teacher_id_fkey"
   FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lms_course_links" ADD CONSTRAINT "lms_course_links_connection_id_fkey"
   FOREIGN KEY ("connection_id") REFERENCES "lms_connections"("id") ON DELETE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lms_course_links" ADD CONSTRAINT "lms_course_links_course_id_fkey"
   FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lms_roster_entries" ADD CONSTRAINT "lms_roster_entries_course_link_id_fkey"
   FOREIGN KEY ("course_link_id") REFERENCES "lms_course_links"("id") ON DELETE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lms_id_map" ADD CONSTRAINT "lms_id_map_course_link_id_fkey"
   FOREIGN KEY ("course_link_id") REFERENCES "lms_course_links"("id") ON DELETE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lms_id_map" ADD CONSTRAINT "lms_id_map_confirmed_by_user_id_fkey"
   FOREIGN KEY ("confirmed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lms_sync_runs" ADD CONSTRAINT "lms_sync_runs_connection_id_fkey"
   FOREIGN KEY ("connection_id") REFERENCES "lms_connections"("id") ON DELETE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lms_sync_runs" ADD CONSTRAINT "lms_sync_runs_course_link_id_fkey"
   FOREIGN KEY ("course_link_id") REFERENCES "lms_course_links"("id") ON DELETE SET NULL;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lms_sync_runs" ADD CONSTRAINT "lms_sync_runs_requested_by_id_fkey"
   FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lms_connections_teacher_idx" ON "lms_connections" ("teacher_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lms_course_links_course_idx" ON "lms_course_links" ("course_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lms_course_links_connection_idx" ON "lms_course_links" ("connection_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lms_roster_entries_link_user_idx" ON "lms_roster_entries" ("course_link_id", "canvas_user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lms_id_map_link_type_local_idx" ON "lms_id_map" ("course_link_id", "local_type", "local_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lms_id_map_link_type_external_idx" ON "lms_id_map" ("course_link_id", "local_type", "external_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lms_sync_runs_connection_created_idx" ON "lms_sync_runs" ("connection_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lms_sync_runs_status_idx" ON "lms_sync_runs" ("status", "created_at") WHERE "status" in ('pending', 'running');
