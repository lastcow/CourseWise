-- Canvas-style assignment groups. Per-course named buckets that replace the
-- five hardcoded grading-policy weight columns. Attendance stays as a
-- course-level weight on grading_policies; everything else moves into groups.
--   1. Create the assignment_groups table.
--   2. Add nullable group_id FKs on assignments, quizzes, discussion_topics.
--   3. Backfill four default groups per existing course with weights pulled
--      from grading_policies.
--   4. Assign every existing item to its default group (using the legacy
--      isFinalProjectTitle keyword pattern for "Final Project").
--   5. Drop the four legacy weight columns from grading_policies.
--   6. Flag every final_grades row as outdated so teachers re-finalize.

CREATE TABLE IF NOT EXISTS "assignment_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "course_id" uuid NOT NULL,
  "name" text NOT NULL,
  "weight" integer NOT NULL,
  "position" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignment_groups" ADD CONSTRAINT "assignment_groups_course_id_courses_id_fk"
   FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignment_groups_course_idx" ON "assignment_groups" USING btree ("course_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "assignment_groups_course_name_idx" ON "assignment_groups" USING btree ("course_id", lower("name"));
--> statement-breakpoint
ALTER TABLE "assignments"        ADD COLUMN IF NOT EXISTS "group_id" uuid;
--> statement-breakpoint
ALTER TABLE "quizzes"            ADD COLUMN IF NOT EXISTS "group_id" uuid;
--> statement-breakpoint
ALTER TABLE "discussion_topics"  ADD COLUMN IF NOT EXISTS "group_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignments" ADD CONSTRAINT "assignments_group_id_assignment_groups_id_fk"
   FOREIGN KEY ("group_id") REFERENCES "assignment_groups"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_group_id_assignment_groups_id_fk"
   FOREIGN KEY ("group_id") REFERENCES "assignment_groups"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "discussion_topics" ADD CONSTRAINT "discussion_topics_group_id_assignment_groups_id_fk"
   FOREIGN KEY ("group_id") REFERENCES "assignment_groups"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Backfill four default groups per existing course.
INSERT INTO assignment_groups (course_id, name, weight, position)
SELECT course_id, 'Assignments',   weight_assignments,    0 FROM grading_policies
UNION ALL
SELECT course_id, 'Quizzes',       weight_quizzes,        1 FROM grading_policies
UNION ALL
SELECT course_id, 'Discussion',    weight_discussion,     2 FROM grading_policies
UNION ALL
SELECT course_id, 'Final Project', weight_final_project,  3 FROM grading_policies;
--> statement-breakpoint
-- Assign existing assignments to either the Final Project group (if title
-- matches the legacy keyword pattern) or the Assignments group.
UPDATE assignments a
   SET group_id = ag.id
  FROM assignment_groups ag
 WHERE ag.course_id = a.course_id
   AND ag.name = 'Final Project'
   AND (
        lower(a.title) LIKE '%final project%' OR
        lower(a.title) LIKE '%final_project%' OR
        lower(a.title) LIKE '%finalproject%' OR
        a.title LIKE '%期末%' OR
        a.title LIKE '%结业%'
   );
--> statement-breakpoint
UPDATE assignments a
   SET group_id = ag.id
  FROM assignment_groups ag
 WHERE ag.course_id = a.course_id
   AND ag.name = 'Assignments'
   AND a.group_id IS NULL;
--> statement-breakpoint
UPDATE quizzes q
   SET group_id = ag.id
  FROM assignment_groups ag
 WHERE ag.course_id = q.course_id AND ag.name = 'Quizzes';
--> statement-breakpoint
UPDATE discussion_topics dt
   SET group_id = ag.id
  FROM assignment_groups ag
 WHERE ag.course_id = dt.course_id AND ag.name = 'Discussion';
--> statement-breakpoint
ALTER TABLE "grading_policies" DROP COLUMN IF EXISTS "weight_assignments";
--> statement-breakpoint
ALTER TABLE "grading_policies" DROP COLUMN IF EXISTS "weight_quizzes";
--> statement-breakpoint
ALTER TABLE "grading_policies" DROP COLUMN IF EXISTS "weight_discussion";
--> statement-breakpoint
ALTER TABLE "grading_policies" DROP COLUMN IF EXISTS "weight_final_project";
--> statement-breakpoint
-- Force re-finalization so teachers see the new model applied.
UPDATE final_grades SET is_outdated = true;
