-- One Canvas identity links to at most ONE CourseWise student per course
-- link. The (course_link_id, local_type, local_id) unique index already
-- protects the student side; without this partial index two concurrent
-- confirms could link two different students to the same Canvas user —
-- which P3 grade writeback would then turn into grades delivered to the
-- wrong Canvas account.
CREATE UNIQUE INDEX IF NOT EXISTS "lms_id_map_student_link_external_idx"
  ON "lms_id_map" ("course_link_id", "external_id")
  WHERE "local_type" = 'student_link';
