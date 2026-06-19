-- Quiz lockdown / exam mode.
--   quizzes.lockdown: when true, the student runner blocks copy/paste/right-click
--     and flags tab/app switches while an attempt is in progress.
--   quiz_attempts.lockdown_violations: count of detected switches, shown to the
--     teacher on the grading page.
DO $$ BEGIN
  ALTER TABLE "quizzes" ADD COLUMN "lockdown" boolean DEFAULT false NOT NULL;
EXCEPTION
 WHEN duplicate_column THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "quiz_attempts" ADD COLUMN "lockdown_violations" integer DEFAULT 0 NOT NULL;
EXCEPTION
 WHEN duplicate_column THEN null;
END $$;
