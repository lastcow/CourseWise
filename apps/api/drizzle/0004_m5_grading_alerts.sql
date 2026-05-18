-- M5 — Grading Policy / Final Grades / Alerts / Dashboards.
-- All additive. Existing data preserved; default policy backfilled per course.

DO $$ BEGIN
 CREATE TYPE "public"."alert_type" AS ENUM(
   'attendance_low',
   'consecutive_absences',
   'late_submissions',
   'quiz_average_low',
   'inactivity',
   'manual'
 );
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."alert_severity" AS ENUM('info', 'warning', 'critical');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."alert_status" AS ENUM('open', 'resolved', 'dismissed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- ---------- grading_policies ----------
CREATE TABLE IF NOT EXISTS "grading_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "course_id" uuid NOT NULL,
  "weight_attendance" integer DEFAULT 10 NOT NULL,
  "weight_assignments" integer DEFAULT 35 NOT NULL,
  "weight_quizzes" integer DEFAULT 30 NOT NULL,
  "weight_discussion" integer DEFAULT 10 NOT NULL,
  "weight_final_project" integer DEFAULT 15 NOT NULL,
  "letters_json" jsonb,
  "version" integer DEFAULT 1 NOT NULL,
  "updated_by_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grading_policies" ADD CONSTRAINT "grading_policies_course_id_fkey"
   FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grading_policies" ADD CONSTRAINT "grading_policies_updated_by_id_fkey"
   FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "grading_policies_course_idx"
  ON "grading_policies" ("course_id");
--> statement-breakpoint

-- Backfill: every existing course gets a default policy if it doesn't have one yet.
INSERT INTO "grading_policies" ("course_id")
SELECT c."id"
FROM "courses" c
LEFT JOIN "grading_policies" gp ON gp."course_id" = c."id"
WHERE gp."id" IS NULL;
--> statement-breakpoint

-- ---------- final_grades extension ----------
ALTER TABLE "final_grades" ADD COLUMN IF NOT EXISTS "category_scores" jsonb;
--> statement-breakpoint
ALTER TABLE "final_grades" ADD COLUMN IF NOT EXISTS "is_outdated" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "final_grades" ADD COLUMN IF NOT EXISTS "teacher_override_score" numeric(6,2);
--> statement-breakpoint
ALTER TABLE "final_grades" ADD COLUMN IF NOT EXISTS "teacher_override_reason" text;
--> statement-breakpoint

-- ---------- alerts extension ----------
ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "course_id" uuid REFERENCES "courses"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "severity" "alert_severity" DEFAULT 'warning' NOT NULL;
--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "status" "alert_status" DEFAULT 'open' NOT NULL;
--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "metadata_json" jsonb;
--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "resolved_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "resolved_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "resolution_note" text;
--> statement-breakpoint

-- Migrate `type` to the alert_type enum. Existing rows used free-form text;
-- coerce unknown values to 'manual' so the typed enum stays consistent.
ALTER TABLE "alerts"
  ALTER COLUMN "type" TYPE "alert_type"
  USING (
    CASE
      WHEN "type" IN ('attendance_low','consecutive_absences','late_submissions','quiz_average_low','inactivity','manual')
        THEN "type"::"alert_type"
      ELSE 'manual'::"alert_type"
    END
  );
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "alerts_course_idx" ON "alerts" ("course_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alerts_status_idx" ON "alerts" ("status");
--> statement-breakpoint
-- Partial unique index so we don't generate duplicate open alerts for the same
-- (user, course, type). Resolved/dismissed rows are excluded by the predicate.
CREATE UNIQUE INDEX IF NOT EXISTS "alerts_open_type_idx"
  ON "alerts" ("user_id", "course_id", "type")
  WHERE "status" = 'open';
