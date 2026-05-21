-- Student groups (Canvas-style group sets). PR1 of the groups feature.
-- A course can have many named groupSets ("Lab Groups", "Project Teams");
-- each set contains N groups capped at maxMembersPerGroup. Students belong
-- to at most one group per set (unique constraint on (group_set_id, student_id)
-- — the set id is denormalized onto the membership row so PG can enforce it).
-- Self-signup is first-come-first-served until the teacher locks the set.
-- PR2 will add submissionMode/groupSetId to assignments + group submission flow.

DO $$ BEGIN
 CREATE TYPE "group_set_signup_mode" AS ENUM ('self_signup', 'teacher_assigned', 'mixed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "group_set_signup_status" AS ENUM ('open', 'locked');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "group_sets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "course_id" uuid NOT NULL,
  "name" text NOT NULL,
  "max_members_per_group" integer NOT NULL,
  "signup_mode" "group_set_signup_mode" NOT NULL DEFAULT 'self_signup',
  "signup_status" "group_set_signup_status" NOT NULL DEFAULT 'open',
  "created_by_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "group_sets" ADD CONSTRAINT "group_sets_course_id_courses_id_fk"
   FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "group_sets" ADD CONSTRAINT "group_sets_created_by_id_users_id_fk"
   FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "group_sets_course_idx" ON "group_sets" USING btree ("course_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "group_sets_course_name_idx" ON "group_sets" USING btree ("course_id", lower("name"));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_set_id" uuid NOT NULL,
  "name" text NOT NULL,
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "groups" ADD CONSTRAINT "groups_group_set_id_group_sets_id_fk"
   FOREIGN KEY ("group_set_id") REFERENCES "group_sets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "groups_group_set_idx" ON "groups" USING btree ("group_set_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "groups_set_name_idx" ON "groups" USING btree ("group_set_id", lower("name"));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "group_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_set_id" uuid NOT NULL,
  "group_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_group_set_id_group_sets_id_fk"
   FOREIGN KEY ("group_set_id") REFERENCES "group_sets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_group_id_groups_id_fk"
   FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_student_id_users_id_fk"
   FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "group_memberships_set_student_idx" ON "group_memberships" USING btree ("group_set_id", "student_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "group_memberships_group_idx" ON "group_memberships" USING btree ("group_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "group_memberships_student_idx" ON "group_memberships" USING btree ("student_id");
