-- Per-course opt-in: once the course end date has passed, stop accepting
-- student submissions (assignment submits, quiz attempts, discussion posts).
-- Additive and backwards-compatible — defaults to false so existing courses
-- keep accepting submissions until a teacher/admin turns this on.
ALTER TABLE "courses"
  ADD COLUMN IF NOT EXISTS "disable_submissions_after_end" boolean NOT NULL DEFAULT false;
