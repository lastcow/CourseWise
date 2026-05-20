-- Self-sign attendance records the requestor IP as proof of presence for
-- in-person classes. Nullable so teacher-marked rows remain valid.

ALTER TABLE "attendance_records"
  ADD COLUMN IF NOT EXISTS "ip_address" text;
