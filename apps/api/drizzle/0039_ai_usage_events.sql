-- Per-request AI chat usage accounting (token counts + estimated neurons)
-- backing the profile page's usage chart. No message content is stored.

CREATE TABLE IF NOT EXISTS "ai_usage_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "feature" text NOT NULL,
  "model" text NOT NULL,
  "prompt_tokens" integer,
  "completion_tokens" integer,
  "neurons" numeric(12, 2),
  "course_id" uuid,
  "context_title" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_course_id_courses_id_fk"
    FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_usage_events_user_created_idx"
  ON "ai_usage_events" ("user_id", "created_at");
