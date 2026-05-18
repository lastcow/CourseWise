-- Phase 1 of the AI content generator: foundation tables only.
-- No generation logic ships yet — these tables support admin-managed providers
-- and models, plus job/artifact bookkeeping that later phases will populate.
-- Additive. No data backfill required.

DO $$ BEGIN
 CREATE TYPE "ai_provider_kind" AS ENUM ('anthropic', 'openai');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "ai_job_status" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'partial', 'canceled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "ai_artifact_kind" AS ENUM ('material', 'presentation', 'assignment', 'project', 'quiz');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "ai_artifact_status" AS ENUM ('pending', 'running', 'succeeded', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_providers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "kind" "ai_provider_kind" NOT NULL,
  "display_name" text NOT NULL,
  "api_key_secret_ref" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_providers_kind_unique" ON "ai_providers" ("kind");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_models" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "provider_id" uuid NOT NULL,
  "model_id" text NOT NULL,
  "display_name" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "cost_in_per_1m" numeric(12, 4),
  "cost_out_per_1m" numeric(12, 4),
  "capabilities" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_provider_id_fkey"
   FOREIGN KEY ("provider_id") REFERENCES "ai_providers"("id") ON DELETE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_models_provider_model_unique"
  ON "ai_models" ("provider_id", "model_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_generation_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "course_id" uuid NOT NULL,
  "created_by" uuid NOT NULL,
  "model_id" uuid NOT NULL,
  "status" "ai_job_status" DEFAULT 'queued' NOT NULL,
  "request" jsonb NOT NULL,
  "result" jsonb,
  "prompt_tokens" integer,
  "completion_tokens" integer,
  "cost_cents" integer,
  "error" text,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_course_id_fkey"
   FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_created_by_fkey"
   FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_model_id_fkey"
   FOREIGN KEY ("model_id") REFERENCES "ai_models"("id") ON DELETE RESTRICT;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_generation_jobs_course_idx" ON "ai_generation_jobs" ("course_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_generation_jobs_status_idx" ON "ai_generation_jobs" ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_generation_artifacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL,
  "kind" "ai_artifact_kind" NOT NULL,
  "artifact_id" uuid,
  "module_id" uuid,
  "status" "ai_artifact_status" DEFAULT 'pending' NOT NULL,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_generation_artifacts" ADD CONSTRAINT "ai_generation_artifacts_job_id_fkey"
   FOREIGN KEY ("job_id") REFERENCES "ai_generation_jobs"("id") ON DELETE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_generation_artifacts_job_idx" ON "ai_generation_artifacts" ("job_id");
