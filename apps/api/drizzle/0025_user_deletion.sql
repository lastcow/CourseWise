-- User hard-delete bookkeeping.
--   user_deletion_log: append-only audit row recorded every time an admin or
--     teacher deletes a student account (typically to fix a wrong-email
--     registration). user_id is orphan-tolerant — the users row is gone by
--     the time this lands. email_status / email_provider_id capture whether
--     the notification email actually shipped.
CREATE TABLE IF NOT EXISTS "user_deletion_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "user_email" text NOT NULL,
  "user_name" text NOT NULL,
  "user_role" text NOT NULL,
  "deleted_by" uuid,
  "deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reason" text,
  "enrollment_count" integer NOT NULL,
  "email_status" text NOT NULL,
  "email_provider_id" text,
  "child_counts" jsonb NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_deletion_log" ADD CONSTRAINT "user_deletion_log_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_deletion_log_user_idx" ON "user_deletion_log" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_deletion_log_deleted_at_idx" ON "user_deletion_log" ("deleted_at");
