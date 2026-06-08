-- Quiz tester schedules (staggered / waved availability). Additive.
--
-- A quiz with ZERO schedule rows behaves exactly as before (global
-- start_time/end_time/until_date apply to all enrolled students). Once a wave
-- exists, access is GATED: only students in a wave (or absorbed by the single
-- remainder wave) may start an attempt. Each wave may override any window/limit
-- field; null = inherit the quiz value. quiz_attempts.schedule_id records which
-- wave governed an attempt (on delete set null preserves history).

-- New alert type for the wave-open notification.
DO $$ BEGIN ALTER TYPE "public"."alert_type" ADD VALUE IF NOT EXISTS 'quiz_schedule_open'; EXCEPTION WHEN OTHERS THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quiz_schedules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "quiz_id" uuid NOT NULL,
  "name" text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "is_remainder" boolean DEFAULT false NOT NULL,
  "start_time" timestamp with time zone,
  "end_time" timestamp with time zone,
  "until_date" timestamp with time zone,
  "time_limit_minutes" integer,
  "max_attempts" integer,
  "created_by_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quiz_schedules" ADD CONSTRAINT "quiz_schedules_quiz_id_fkey"
   FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quiz_schedules" ADD CONSTRAINT "quiz_schedules_created_by_id_fkey"
   FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quiz_schedules_quiz_idx" ON "quiz_schedules" ("quiz_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quiz_schedules_one_remainder_idx" ON "quiz_schedules" ("quiz_id") WHERE "is_remainder" = true;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quiz_schedule_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "schedule_id" uuid NOT NULL,
  "quiz_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "notified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quiz_schedule_members" ADD CONSTRAINT "quiz_schedule_members_schedule_id_fkey"
   FOREIGN KEY ("schedule_id") REFERENCES "quiz_schedules"("id") ON DELETE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quiz_schedule_members" ADD CONSTRAINT "quiz_schedule_members_quiz_id_fkey"
   FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quiz_schedule_members" ADD CONSTRAINT "quiz_schedule_members_student_id_fkey"
   FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quiz_schedule_members_schedule_idx" ON "quiz_schedule_members" ("schedule_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quiz_schedule_members_quiz_student_idx" ON "quiz_schedule_members" ("quiz_id", "student_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quiz_schedule_members_notify_idx" ON "quiz_schedule_members" ("notified_at");
--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD COLUMN IF NOT EXISTS "schedule_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_schedule_id_fkey"
   FOREIGN KEY ("schedule_id") REFERENCES "quiz_schedules"("id") ON DELETE SET NULL;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quiz_attempts_schedule_idx" ON "quiz_attempts" ("schedule_id");
