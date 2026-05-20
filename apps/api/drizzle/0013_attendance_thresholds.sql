-- Self-sign cut-offs for an attendance session.
--   late_after_minutes:   sign after this many minutes past session_date → record as 'late'
--   absent_after_minutes: sign after this many minutes past session_date → rejected
-- Both nullable: null means "no cut-off applies" (sign always counts as present).
-- Order constraint guarantees absent ≥ late so the UI/state machine is well-defined.

ALTER TABLE "attendance_sessions"
  ADD COLUMN IF NOT EXISTS "late_after_minutes" integer;
--> statement-breakpoint
ALTER TABLE "attendance_sessions"
  ADD COLUMN IF NOT EXISTS "absent_after_minutes" integer;
--> statement-breakpoint
ALTER TABLE "attendance_sessions"
  ADD CONSTRAINT "attendance_sessions_thresholds_ordered"
  CHECK (
    "late_after_minutes" IS NULL
    OR "absent_after_minutes" IS NULL
    OR "absent_after_minutes" >= "late_after_minutes"
  );
