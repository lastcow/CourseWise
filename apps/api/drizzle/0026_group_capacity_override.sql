-- Per-group capacity override. NULL inherits group_sets.max_members_per_group;
-- a teacher can persistently bump a single group above the set's cap when
-- they need to force-assign an extra student.
ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "max_members_override" integer;
