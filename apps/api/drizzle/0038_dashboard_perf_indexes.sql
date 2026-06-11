-- Indexes backing dashboard/report time-range scans that currently seq-scan:
-- admin activity chart groups submissions by submitted_at, the admin dashboard
-- counts recently graded/late work by graded_at, and the teacher dashboard
-- filters quiz_attempts by status for ungraded subjective answers. Additive.

CREATE INDEX IF NOT EXISTS "assignment_submissions_graded_at_idx"
  ON "assignment_submissions" ("graded_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignment_submissions_submitted_at_idx"
  ON "assignment_submissions" ("submitted_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quiz_attempts_status_idx"
  ON "quiz_attempts" ("status");
