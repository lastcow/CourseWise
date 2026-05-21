-- FERPA §99.32(a) disclosure log: tie each audit row that records a
-- disclosure of student records to the specific student whose record was
-- disclosed, so we can produce "all disclosures of student X's records" on
-- demand.
-- Nullable because most audit rows (logins, course CRUD, etc.) aren't
-- disclosures. Bulk disclosures (CSV exports, multi-student AI sends) write
-- one row per student.

ALTER TABLE "audit_logs"
  ADD COLUMN IF NOT EXISTS "disclosed_student_id" uuid;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "audit_logs"
    ADD CONSTRAINT "audit_logs_disclosed_student_id_fkey"
    FOREIGN KEY ("disclosed_student_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "audit_logs_disclosed_student_idx"
  ON "audit_logs" ("disclosed_student_id", "created_at" DESC);
