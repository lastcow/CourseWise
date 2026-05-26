-- Add 'fr' to the preferred_language enum so user profiles can store
-- French as their preferred locale alongside en and zh-CN. ALTER TYPE
-- ADD VALUE is idempotent here thanks to IF NOT EXISTS; the surrounding
-- DO $$ block additionally tolerates any other transient errors so
-- re-running this migration is safe.
DO $$ BEGIN ALTER TYPE "public"."preferred_language" ADD VALUE IF NOT EXISTS 'fr'; EXCEPTION WHEN OTHERS THEN null; END $$;
