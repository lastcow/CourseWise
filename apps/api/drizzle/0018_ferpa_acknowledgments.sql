-- FERPA §99.7(a): the school must annually notify parents/eligible students
-- of their FERPA rights. We surface that notice as a first-login modal that
-- can't be dismissed without acknowledgment; this table records the
-- acknowledgment so we don't re-prompt within the same academic year.

CREATE TABLE IF NOT EXISTS "ferpa_acknowledgments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  -- Academic-year string in the form "2025-2026". July 1 is the rollover
  -- (US K-12 / common university convention); see currentAcademicYear() in
  -- apps/api/src/services/ferpaAcknowledgment.ts.
  "academic_year" text NOT NULL,
  "acknowledged_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ip" text,
  "user_agent" text
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "ferpa_acknowledgments"
    ADD CONSTRAINT "ferpa_acknowledgments_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- One row per (user, year) — both the row guard and the natural index for
-- the "have they acknowledged this year?" lookup.
CREATE UNIQUE INDEX IF NOT EXISTS "ferpa_acknowledgments_user_year_idx"
  ON "ferpa_acknowledgments" ("user_id", "academic_year");
