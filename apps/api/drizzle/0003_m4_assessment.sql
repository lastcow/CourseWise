-- M4 — Assessment (quizzes + attendance) schema additions. All changes are
-- additive in spirit. Quiz tables were declared in M1 but had no data, so
-- column drops below are safe.

DO $$ BEGIN
 CREATE TYPE "public"."quiz_status" AS ENUM('draft', 'published', 'closed', 'archived');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."quiz_attempt_status" AS ENUM('in_progress', 'submitted', 'expired');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."attendance_session_status" AS ENUM('open', 'closed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Extend quiz_question_type enum with the spec's five canonical values.
DO $$ BEGIN ALTER TYPE "public"."quiz_question_type" ADD VALUE IF NOT EXISTS 'multiple_choice'; EXCEPTION WHEN OTHERS THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TYPE "public"."quiz_question_type" ADD VALUE IF NOT EXISTS 'true_false'; EXCEPTION WHEN OTHERS THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TYPE "public"."quiz_question_type" ADD VALUE IF NOT EXISTS 'case_analysis'; EXCEPTION WHEN OTHERS THEN null; END $$;
--> statement-breakpoint

-- ---------- quizzes ----------
ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "course_id" uuid;
--> statement-breakpoint
-- Backfill course_id from the existing module_id (quizzes had module_id NOT NULL).
UPDATE "quizzes" q
  SET "course_id" = m."course_id"
  FROM "modules" m
  WHERE q."module_id" = m."id" AND q."course_id" IS NULL;
--> statement-breakpoint
DELETE FROM "quizzes" WHERE "course_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "quizzes" ALTER COLUMN "course_id" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- module_id becomes optional with set-null on cascade.
ALTER TABLE "quizzes" DROP CONSTRAINT IF EXISTS "quizzes_module_id_modules_id_fk";
--> statement-breakpoint
ALTER TABLE "quizzes" ALTER COLUMN "module_id" DROP NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE SET NULL;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "description" text;
--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "status" "quiz_status" DEFAULT 'draft' NOT NULL;
--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "start_time" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "end_time" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "time_limit_minutes" integer;
--> statement-breakpoint
-- If a legacy time_limit_seconds column exists, migrate value then drop.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quizzes' AND column_name = 'time_limit_seconds'
  ) THEN
    UPDATE "quizzes"
      SET "time_limit_minutes" = COALESCE("time_limit_minutes", CEIL("time_limit_seconds" / 60.0))
      WHERE "time_limit_seconds" IS NOT NULL;
    ALTER TABLE "quizzes" DROP COLUMN "time_limit_seconds";
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "passing_score" numeric(6,2);
--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "published_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "closed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "created_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quizzes_course_idx" ON "quizzes" ("course_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quizzes_status_idx" ON "quizzes" ("status");
--> statement-breakpoint

-- ---------- quiz_questions ----------
ALTER TABLE "quiz_questions" ADD COLUMN IF NOT EXISTS "explanation" text;
--> statement-breakpoint

-- ---------- quiz_attempts ----------
ALTER TABLE "quiz_attempts" ADD COLUMN IF NOT EXISTS "status" "quiz_attempt_status" DEFAULT 'in_progress' NOT NULL;
--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD COLUMN IF NOT EXISTS "max_score" numeric(6,2);
--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD COLUMN IF NOT EXISTS "teacher_reviewed" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD COLUMN IF NOT EXISTS "graded_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD COLUMN IF NOT EXISTS "graded_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint

-- ---------- quiz_answers ----------
ALTER TABLE "quiz_answers" ADD COLUMN IF NOT EXISTS "feedback" text;
--> statement-breakpoint
ALTER TABLE "quiz_answers" ADD COLUMN IF NOT EXISTS "graded_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "quiz_answers" ADD COLUMN IF NOT EXISTS "graded_at" timestamp with time zone;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quiz_answers_attempt_question_idx" ON "quiz_answers" ("attempt_id", "question_id");
--> statement-breakpoint

-- ---------- attendance_sessions ----------
ALTER TABLE "attendance_sessions" ADD COLUMN IF NOT EXISTS "description" text;
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD COLUMN IF NOT EXISTS "status" "attendance_session_status" DEFAULT 'open' NOT NULL;
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD COLUMN IF NOT EXISTS "closed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD COLUMN IF NOT EXISTS "created_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_sessions_status_idx" ON "attendance_sessions" ("status");
--> statement-breakpoint

-- ---------- attendance_records ----------
ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "notes" text;
