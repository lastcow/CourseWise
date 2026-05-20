ALTER TABLE "presentations"
  ADD COLUMN IF NOT EXISTS "share_token" text;
--> statement-breakpoint
ALTER TABLE "presentations"
  ADD COLUMN IF NOT EXISTS "share_enabled" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "presentations"
  ADD COLUMN IF NOT EXISTS "share_enabled_at" timestamp with time zone;
--> statement-breakpoint

-- Token is opaque and lookup-keyed; the unique index doubles as the lookup
-- index on the public share endpoint.
CREATE UNIQUE INDEX IF NOT EXISTS "presentations_share_token_unique"
  ON "presentations" ("share_token")
  WHERE "share_token" IS NOT NULL;
