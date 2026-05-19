DO $$ BEGIN
 CREATE TYPE "ai_event_level" AS ENUM ('info', 'warn', 'error');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_generation_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL,
  "artifact_id" uuid,
  "level" "ai_event_level" DEFAULT 'info' NOT NULL,
  "type" text NOT NULL,
  "message" text NOT NULL,
  "metadata" jsonb,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_generation_events" ADD CONSTRAINT "ai_generation_events_job_id_fkey"
   FOREIGN KEY ("job_id") REFERENCES "ai_generation_jobs"("id") ON DELETE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_generation_events" ADD CONSTRAINT "ai_generation_events_artifact_id_fkey"
   FOREIGN KEY ("artifact_id") REFERENCES "ai_generation_artifacts"("id") ON DELETE SET NULL;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_generation_events_job_occurred_idx"
  ON "ai_generation_events" ("job_id", "occurred_at");
