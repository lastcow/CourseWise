CREATE TYPE "mobile_platform" AS ENUM ('ios', 'ipados');
CREATE TYPE "apns_environment" AS ENUM ('sandbox', 'production');
CREATE TYPE "account_deletion_status" AS ENUM ('open', 'cancelled', 'completed', 'declined');

CREATE TABLE "mobile_devices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "installation_id" uuid NOT NULL,
  "platform" "mobile_platform" NOT NULL,
  "environment" "apns_environment" NOT NULL,
  "apns_token" text NOT NULL,
  "app_version" text NOT NULL,
  "os_version" text NOT NULL,
  "locale" text NOT NULL,
  "timezone" text NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "mobile_devices_installation_idx"
  ON "mobile_devices" ("installation_id");
CREATE UNIQUE INDEX "mobile_devices_token_environment_idx"
  ON "mobile_devices" ("apns_token", "environment");
CREATE INDEX "mobile_devices_user_idx"
  ON "mobile_devices" ("user_id", "last_seen_at");

CREATE TABLE "notification_preferences" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE cascade,
  "announcements" boolean DEFAULT true NOT NULL,
  "messages" boolean DEFAULT true NOT NULL,
  "assignments" boolean DEFAULT true NOT NULL,
  "quizzes" boolean DEFAULT true NOT NULL,
  "grades" boolean DEFAULT true NOT NULL,
  "attendance" boolean DEFAULT true NOT NULL,
  "risk_alerts" boolean DEFAULT true NOT NULL,
  "sensitive_previews" boolean DEFAULT false NOT NULL,
  "quiet_hours_start" text,
  "quiet_hours_end" text,
  "timezone" text DEFAULT 'UTC' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "notification_preferences_quiet_hours_pair" CHECK (
    ("quiet_hours_start" IS NULL AND "quiet_hours_end" IS NULL) OR
    ("quiet_hours_start" IS NOT NULL AND "quiet_hours_end" IS NOT NULL)
  )
);

CREATE TABLE "account_deletion_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "status" "account_deletion_status" DEFAULT 'open' NOT NULL,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone,
  "resolution_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "account_deletion_requests_user_created_idx"
  ON "account_deletion_requests" ("user_id", "created_at");
CREATE UNIQUE INDEX "account_deletion_requests_open_user_idx"
  ON "account_deletion_requests" ("user_id") WHERE "status" = 'open';
