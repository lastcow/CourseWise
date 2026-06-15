-- Collapse duplicate message threads into one conversation per (course,
-- participant pair), then enforce that uniqueness so it can't recur.
--
-- The original design canonicalized the pair (participant_a_id <
-- participant_b_id) to "eliminate duplicate threads", but the send path never
-- looked up an existing thread before inserting. Every "new message" compose
-- (which carries no threadId) therefore created a fresh thread, so a
-- conversation between the same two people fanned out across parallel threads
-- instead of grouping together. This migration merges those, keeping the
-- oldest thread of each pair as the canonical one.
--
-- Idempotent: once each pair has a single thread the canonical id equals that
-- row's id, so every "<> canonical" predicate matches nothing on re-run.

-- 1. Re-point every duplicate's messages onto the canonical (oldest) thread.
UPDATE "messages" m
SET "thread_id" = grp.canonical_id
FROM "message_threads" t
JOIN (
  SELECT
    "course_id",
    "participant_a_id",
    "participant_b_id",
    (array_agg("id" ORDER BY "created_at", "id"))[1] AS canonical_id
  FROM "message_threads"
  GROUP BY "course_id", "participant_a_id", "participant_b_id"
) grp
  ON grp."course_id" = t."course_id"
 AND grp."participant_a_id" = t."participant_a_id"
 AND grp."participant_b_id" = t."participant_b_id"
WHERE m."thread_id" = t."id"
  AND t."id" <> grp.canonical_id;
--> statement-breakpoint

-- 2. Merge each participant's private soft-delete onto the canonical thread.
--    The conversation stays visible if ANY merged thread was visible (a NULL
--    delete flag); only if the participant had deleted all of them do we keep
--    it hidden, using the most recent delete timestamp.
UPDATE "message_threads" t
SET
  "deleted_by_a_at" = grp.a_at,
  "deleted_by_b_at" = grp.b_at,
  "updated_at" = now()
FROM (
  SELECT
    (array_agg("id" ORDER BY "created_at", "id"))[1] AS canonical_id,
    CASE WHEN bool_or("deleted_by_a_at" IS NULL) THEN NULL ELSE max("deleted_by_a_at") END AS a_at,
    CASE WHEN bool_or("deleted_by_b_at" IS NULL) THEN NULL ELSE max("deleted_by_b_at") END AS b_at
  FROM "message_threads"
  GROUP BY "course_id", "participant_a_id", "participant_b_id"
) grp
WHERE t."id" = grp.canonical_id;
--> statement-breakpoint

-- 3. Recompute the canonical thread's denormalized last-message fields from
--    its now-merged message set.
UPDATE "message_threads" t
SET
  "last_message_at" = lm."created_at",
  "last_message_sender_id" = lm."sender_id",
  "updated_at" = now()
FROM (
  SELECT DISTINCT ON ("thread_id") "thread_id", "created_at", "sender_id"
  FROM "messages"
  ORDER BY "thread_id", "created_at" DESC, "id" DESC
) lm
WHERE t."id" = lm."thread_id";
--> statement-breakpoint

-- 4. Delete the now-empty duplicate threads (their messages were re-pointed).
DELETE FROM "message_threads" t
USING (
  SELECT
    "course_id",
    "participant_a_id",
    "participant_b_id",
    (array_agg("id" ORDER BY "created_at", "id"))[1] AS canonical_id
  FROM "message_threads"
  GROUP BY "course_id", "participant_a_id", "participant_b_id"
) grp
WHERE t."course_id" = grp."course_id"
  AND t."participant_a_id" = grp."participant_a_id"
  AND t."participant_b_id" = grp."participant_b_id"
  AND t."id" <> grp.canonical_id;
--> statement-breakpoint

-- 5. Enforce one thread per pair per course going forward.
CREATE UNIQUE INDEX IF NOT EXISTS "message_threads_course_pair_uniq"
  ON "message_threads" ("course_id", "participant_a_id", "participant_b_id");
