-- COU-16 — Admin-issued teacher invitations.
-- Additive. No data backfill required.

CREATE TABLE IF NOT EXISTS "teacher_invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "invited_by_user_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "accepted_at" timestamp with time zone,
  "accepted_user_id" uuid,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teacher_invitations" ADD CONSTRAINT "teacher_invitations_invited_by_user_id_fkey"
   FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teacher_invitations" ADD CONSTRAINT "teacher_invitations_accepted_user_id_fkey"
   FOREIGN KEY ("accepted_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "teacher_invitations_token_hash_idx" ON "teacher_invitations" ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teacher_invitations_email_idx" ON "teacher_invitations" (lower("email"));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teacher_invitations_expires_at_idx" ON "teacher_invitations" ("expires_at");
--> statement-breakpoint
-- A single pending (not accepted, not revoked) invitation per email.
CREATE UNIQUE INDEX IF NOT EXISTS "teacher_invitations_pending_email_idx"
  ON "teacher_invitations" (lower("email"))
  WHERE "accepted_at" IS NULL AND "revoked_at" IS NULL;
