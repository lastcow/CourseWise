-- Composite index for per-student discussion queries: the paginated posts
-- endpoint's author mode and the grades endpoint's per-student post counts
-- both filter on (topic_id, author_id). Additive.

CREATE INDEX IF NOT EXISTS "discussion_posts_topic_author_idx"
  ON "discussion_posts" ("topic_id", "author_id");
