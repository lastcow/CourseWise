-- Flag courses that were imported from / linked to an external LMS
-- (null = native CourseWise course). Backfill from lms_course_links: every
-- link so far is a Canvas import/link.
DO $$ BEGIN
 ALTER TABLE "courses" ADD COLUMN "lms_provider" "lms_provider";
EXCEPTION
 WHEN duplicate_column THEN null;
END $$;
--> statement-breakpoint
UPDATE "courses" SET "lms_provider" = 'canvas'
WHERE "lms_provider" IS NULL
  AND "id" IN (SELECT "course_id" FROM "lms_course_links");
