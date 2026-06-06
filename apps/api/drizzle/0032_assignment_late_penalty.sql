-- Late-submission penalty policy. Additive columns only.
--
-- On `assignments`: when late submission is allowed, deduct
-- `late_penalty_percent_per_period`% for each started `late_penalty_period_hours`
-- window past the deadline, capped at `late_penalty_max_percent`%. All null ⇒
-- late allowed with no deduction.
--
-- On `assignment_submissions`: snapshot the penalty applied at grade time —
-- `raw_score` is the teacher's pre-penalty score, `late_penalty_percent` is the
-- deduction applied (0 when none/waived), and the existing `score` is the final.

ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "late_penalty_percent_per_period" numeric(5, 2);
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "late_penalty_period_hours" integer;
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "late_penalty_max_percent" numeric(5, 2);
--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD COLUMN IF NOT EXISTS "raw_score" numeric(6, 2);
--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD COLUMN IF NOT EXISTS "late_penalty_percent" numeric(5, 2);
--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD COLUMN IF NOT EXISTS "late_penalty_waived" boolean DEFAULT false NOT NULL;
