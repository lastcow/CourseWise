-- FERPA §99.20: students can request correction of education records they
-- believe are inaccurate or misleading. This table is the queue of those
-- requests with their resolution state.

DO $$ BEGIN
  CREATE TYPE "record_correction_target" AS ENUM (
    'final_grade', 'attendance', 'submission', 'discussion', 'profile', 'other'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "record_correction_status" AS ENUM (
    'open', 'accepted', 'declined', 'withdrawn'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "record_correction_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "student_id" uuid NOT NULL,
  -- Optional: many requests scope to a specific course (grade dispute, an
  -- attendance entry). Profile corrections leave it NULL.
  "course_id" uuid,
  "target_type" "record_correction_target" NOT NULL,
  -- Polymorphic by design — could be a final_grades id, a submission id, an
  -- attendance_records id, or just text the student typed. Not a real FK.
  "target_id" text,
  "description" text NOT NULL,
  "status" "record_correction_status" NOT NULL DEFAULT 'open',
  "resolution_note" text,
  "resolved_by_id" uuid,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "record_correction_requests"
    ADD CONSTRAINT "record_correction_requests_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "record_correction_requests"
    ADD CONSTRAINT "record_correction_requests_course_id_fkey"
    FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "record_correction_requests"
    ADD CONSTRAINT "record_correction_requests_resolved_by_id_fkey"
    FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "record_correction_requests_student_idx"
  ON "record_correction_requests" ("student_id", "created_at" DESC);
--> statement-breakpoint
-- Partial index for the teacher-inbox query: open requests per course. The
-- WHERE narrows scan width so the inbox stays fast even as resolved rows
-- accumulate.
CREATE INDEX IF NOT EXISTS "record_correction_requests_course_open_idx"
  ON "record_correction_requests" ("course_id")
  WHERE "status" = 'open';
