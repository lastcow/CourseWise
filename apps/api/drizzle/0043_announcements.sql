-- Course announcements: one-to-many broadcasts from a teacher to enrolled
-- students (distinct from 1:1 messaging).
--   announcements: title + markdown body + lifecycle status. `scheduled` is
--     reserved for a later timed-publish milestone.
--   announcement_reads: per-student read receipts; unique (announcement, user)
--     so the unread badge is exact per announcement.
DO $$ BEGIN
  CREATE TYPE "announcement_status" AS ENUM ('draft', 'scheduled', 'published', 'archived');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "announcements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "course_id" uuid NOT NULL,
  "author_id" uuid,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "status" "announcement_status" DEFAULT 'draft' NOT NULL,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "announcement_reads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "announcement_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcements" ADD CONSTRAINT "announcements_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcements" ADD CONSTRAINT "announcements_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "announcements_course_idx" ON "announcements" ("course_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "announcements_course_status_idx" ON "announcements" ("course_id", "status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "announcement_reads_announcement_user_idx" ON "announcement_reads" ("announcement_id", "user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "announcement_reads_user_idx" ON "announcement_reads" ("user_id");
