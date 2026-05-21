-- Group submissions (PR2 of the groups feature).
-- Assignments can now be in 'group' submission mode, in which case they
-- reference a group_set; submitting fans out one assignment_submissions row
-- per current group member, all linked to a shared group_submissions row
-- that holds the team's content. Grading stays per-row so teachers can
-- adjust each member's grade individually.
-- Quizzes remain individual-only by design.

DO $$ BEGIN
 CREATE TYPE "submission_mode" AS ENUM ('individual', 'group');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "submission_mode" "submission_mode" NOT NULL DEFAULT 'individual';
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "group_set_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignments" ADD CONSTRAINT "assignments_group_set_id_group_sets_id_fk"
   FOREIGN KEY ("group_set_id") REFERENCES "group_sets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Group-mode assignments must point at a group set. Individual-mode rows
-- may have a NULL group_set_id. The CHECK is named so we can drop it
-- safely in a future migration if we ever need to widen the rule.
DO $$ BEGIN
 ALTER TABLE "assignments" ADD CONSTRAINT "assignments_group_set_required"
   CHECK (submission_mode = 'individual' OR group_set_id IS NOT NULL);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "group_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "assignment_id" uuid NOT NULL,
  "group_id" uuid NOT NULL,
  "content" text,
  "file_asset_id" uuid,
  "submitted_at" timestamp with time zone,
  "submitted_by_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "group_submissions" ADD CONSTRAINT "group_submissions_assignment_id_assignments_id_fk"
   FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "group_submissions" ADD CONSTRAINT "group_submissions_group_id_groups_id_fk"
   FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "group_submissions" ADD CONSTRAINT "group_submissions_file_asset_id_file_assets_id_fk"
   FOREIGN KEY ("file_asset_id") REFERENCES "file_assets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "group_submissions" ADD CONSTRAINT "group_submissions_submitted_by_id_users_id_fk"
   FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "group_submissions_assignment_group_idx" ON "group_submissions" USING btree ("assignment_id", "group_id");
--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD COLUMN IF NOT EXISTS "group_submission_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_group_submission_id_group_submissions_id_fk"
   FOREIGN KEY ("group_submission_id") REFERENCES "group_submissions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignment_submissions_group_submission_idx" ON "assignment_submissions" USING btree ("group_submission_id");
