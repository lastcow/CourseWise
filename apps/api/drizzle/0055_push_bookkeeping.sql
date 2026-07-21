-- Push-side echo bookkeeping + remote-missing tombstones on lms_id_map
-- (v3 §2.2/§2.3 subset, laid down early so the P4 sync engine reuses them):
-- last_push_fingerprint/last_push_remote_updated_at record what Canvas held
-- right after our last write; remote_missing_at marks push-origin mappings
-- whose Canvas object has disappeared (deleted there) — skipped on re-push,
-- never auto-recreated.
DO $$ BEGIN
 ALTER TABLE "lms_id_map" ADD COLUMN "last_push_at" timestamp with time zone;
EXCEPTION
 WHEN duplicate_column THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lms_id_map" ADD COLUMN "last_push_remote_updated_at" text;
EXCEPTION
 WHEN duplicate_column THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lms_id_map" ADD COLUMN "last_push_fingerprint" text;
EXCEPTION
 WHEN duplicate_column THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lms_id_map" ADD COLUMN "remote_missing_at" timestamp with time zone;
EXCEPTION
 WHEN duplicate_column THEN null;
END $$;
