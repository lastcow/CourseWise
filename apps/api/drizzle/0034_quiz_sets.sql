-- Quiz sets: a bundle of selected quizzes whose members are graded individually
-- but contribute ONE rolled-up score (average / best-of) to the weighted
-- category referenced by group_id. The quiz twin of assignment_sets. Additive —
-- quizzes.set_id is nullable, so existing rows are unaffected until a teacher
-- creates a set.

DO $$ BEGIN
 CREATE TYPE "quiz_set_rule" AS ENUM ('average', 'highest');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quiz_sets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "course_id" uuid NOT NULL,
  "group_id" uuid,
  "name" text NOT NULL,
  "scoring_rule" "quiz_set_rule" DEFAULT 'average' NOT NULL,
  "position" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quiz_sets" ADD CONSTRAINT "quiz_sets_course_id_fkey"
   FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quiz_sets" ADD CONSTRAINT "quiz_sets_group_id_fkey"
   FOREIGN KEY ("group_id") REFERENCES "assignment_groups"("id") ON DELETE SET NULL;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quiz_sets_course_idx" ON "quiz_sets" ("course_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quiz_sets_course_name_idx" ON "quiz_sets" ("course_id", lower("name"));
--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "set_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_set_id_fkey"
   FOREIGN KEY ("set_id") REFERENCES "quiz_sets"("id") ON DELETE SET NULL;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
