-- Onsite messaging: per-course direct messages between members of a course.
--   message_threads: one row per ongoing conversation between two course
--     members. Pair is canonicalized so participant_a_id < participant_b_id
--     (sorted by uuid::text) — eliminates duplicate (A,B) / (B,A) threads.
--     deleted_by_a_at / deleted_by_b_at give each participant a private
--     soft-delete; a new inbound message clears the corresponding flag.
--   messages: append-only message records inside a thread. Body is markdown
--     text, capped at 8000 chars at the API layer. priority gates inbox
--     sort + visual emphasis (urgent threads bubble to the top).
CREATE TABLE IF NOT EXISTS "message_threads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "course_id" uuid NOT NULL,
  "participant_a_id" uuid NOT NULL,
  "participant_b_id" uuid NOT NULL,
  "subject" text NOT NULL,
  "last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_message_sender_id" uuid,
  "deleted_by_a_at" timestamp with time zone,
  "deleted_by_b_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "message_threads_participants_ordered" CHECK ("participant_a_id" < "participant_b_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "thread_id" uuid NOT NULL,
  "sender_id" uuid NOT NULL,
  "body" text NOT NULL,
  "priority" text NOT NULL DEFAULT 'normal',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "read_at_by_recipient" timestamp with time zone,
  CONSTRAINT "messages_priority_check" CHECK ("priority" IN ('normal', 'high', 'urgent'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_participant_a_id_users_id_fk" FOREIGN KEY ("participant_a_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_participant_b_id_users_id_fk" FOREIGN KEY ("participant_b_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_last_message_sender_id_users_id_fk" FOREIGN KEY ("last_message_sender_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_message_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "message_threads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_threads_course_a_last_idx" ON "message_threads" ("course_id", "participant_a_id", "last_message_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_threads_course_b_last_idx" ON "message_threads" ("course_id", "participant_b_id", "last_message_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_thread_created_idx" ON "messages" ("thread_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_unread_recipient_idx" ON "messages" ("thread_id", "sender_id") WHERE "read_at_by_recipient" IS NULL;
