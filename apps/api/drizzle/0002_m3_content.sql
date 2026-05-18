-- M3 — Teaching Content schema additions (presentations, slides, assignments,
-- submissions, discussion topics/posts/grades). All changes are additive and
-- backwards-compatible.

DO $$ BEGIN
 CREATE TYPE "public"."presentation_status" AS ENUM('draft', 'published', 'archived');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."assignment_status" AS ENUM('draft', 'published', 'closed', 'archived');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."submission_status" AS ENUM('draft', 'submitted', 'late', 'graded', 'returned');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."discussion_topic_status" AS ENUM('draft', 'published', 'archived');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- ---------- presentations ----------
ALTER TABLE "presentations" ADD COLUMN IF NOT EXISTS "course_id" uuid;
--> statement-breakpoint
UPDATE "presentations" p
  SET "course_id" = m."course_id"
  FROM "modules" m
  WHERE p."module_id" = m."id" AND p."course_id" IS NULL;
--> statement-breakpoint
DELETE FROM "presentations" WHERE "course_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "presentations" ALTER COLUMN "course_id" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "presentations" ADD CONSTRAINT "presentations_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "presentations" DROP CONSTRAINT IF EXISTS "presentations_module_id_modules_id_fk";
--> statement-breakpoint
ALTER TABLE "presentations" ALTER COLUMN "module_id" DROP NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "presentations" ADD CONSTRAINT "presentations_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE SET NULL;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "presentations" ADD COLUMN IF NOT EXISTS "description" text;
--> statement-breakpoint
ALTER TABLE "presentations" ADD COLUMN IF NOT EXISTS "status" "presentation_status" DEFAULT 'draft' NOT NULL;
--> statement-breakpoint
ALTER TABLE "presentations" ADD COLUMN IF NOT EXISTS "published_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "presentations" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "presentations" ADD COLUMN IF NOT EXISTS "created_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "presentations_course_idx" ON "presentations" ("course_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "presentations_status_idx" ON "presentations" ("status");
--> statement-breakpoint

-- ---------- slides ----------
ALTER TABLE "slides" ADD COLUMN IF NOT EXISTS "speaker_notes" text;
--> statement-breakpoint
ALTER TABLE "slides" ADD COLUMN IF NOT EXISTS "layout" text;
--> statement-breakpoint
-- Migrate content from jsonb → text (store the jsonb text representation; in
-- practice the field is empty on prod since presentations are brand new).
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'slides' AND column_name = 'content' AND data_type = 'jsonb'
  ) THEN
    ALTER TABLE "slides" ALTER COLUMN "content" TYPE text USING content::text;
  END IF;
END $$;
--> statement-breakpoint

-- ---------- assignments ----------
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "course_id" uuid;
--> statement-breakpoint
UPDATE "assignments" a
  SET "course_id" = m."course_id"
  FROM "modules" m
  WHERE a."module_id" = m."id" AND a."course_id" IS NULL;
--> statement-breakpoint
DELETE FROM "assignments" WHERE "course_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "assignments" ALTER COLUMN "course_id" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignments" ADD CONSTRAINT "assignments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "assignments" DROP CONSTRAINT IF EXISTS "assignments_module_id_modules_id_fk";
--> statement-breakpoint
ALTER TABLE "assignments" ALTER COLUMN "module_id" DROP NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignments" ADD CONSTRAINT "assignments_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE SET NULL;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "rubric" jsonb;
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "allow_late_submission" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "attachment_file_id" uuid REFERENCES "file_assets"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "status" "assignment_status" DEFAULT 'draft' NOT NULL;
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "published_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "closed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "created_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignments_course_idx" ON "assignments" ("course_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignments_status_idx" ON "assignments" ("status");
--> statement-breakpoint

-- ---------- assignment_submissions ----------
ALTER TABLE "assignment_submissions" ADD COLUMN IF NOT EXISTS "status" "submission_status" DEFAULT 'draft' NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "assignment_submissions_assignment_student_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "assignment_submissions_assignment_student_idx" ON "assignment_submissions" ("assignment_id", "student_id");
--> statement-breakpoint

-- ---------- discussion_topics ----------
ALTER TABLE "discussion_topics" ADD COLUMN IF NOT EXISTS "course_id" uuid;
--> statement-breakpoint
UPDATE "discussion_topics" t
  SET "course_id" = m."course_id"
  FROM "modules" m
  WHERE t."module_id" = m."id" AND t."course_id" IS NULL;
--> statement-breakpoint
DELETE FROM "discussion_topics" WHERE "course_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "discussion_topics" ALTER COLUMN "course_id" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "discussion_topics" ADD CONSTRAINT "discussion_topics_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "discussion_topics" DROP CONSTRAINT IF EXISTS "discussion_topics_module_id_modules_id_fk";
--> statement-breakpoint
ALTER TABLE "discussion_topics" ALTER COLUMN "module_id" DROP NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "discussion_topics" ADD CONSTRAINT "discussion_topics_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE SET NULL;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "discussion_topics" ADD COLUMN IF NOT EXISTS "description" text;
--> statement-breakpoint
ALTER TABLE "discussion_topics" ADD COLUMN IF NOT EXISTS "status" "discussion_topic_status" DEFAULT 'draft' NOT NULL;
--> statement-breakpoint
ALTER TABLE "discussion_topics" ADD COLUMN IF NOT EXISTS "is_graded" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "discussion_topics" ADD COLUMN IF NOT EXISTS "is_pinned" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "discussion_topics" ADD COLUMN IF NOT EXISTS "published_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "discussion_topics" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "discussion_topics" ADD COLUMN IF NOT EXISTS "created_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discussion_topics_course_idx" ON "discussion_topics" ("course_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discussion_topics_status_idx" ON "discussion_topics" ("status");
--> statement-breakpoint

-- ---------- discussion_posts ----------
ALTER TABLE "discussion_posts" ALTER COLUMN "content" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "discussion_posts" ADD COLUMN IF NOT EXISTS "is_deleted" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "discussion_posts" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discussion_posts_parent_idx" ON "discussion_posts" ("parent_id");
