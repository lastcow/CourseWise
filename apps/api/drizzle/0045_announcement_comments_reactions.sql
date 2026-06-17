-- Announcements M3: comments + emoji reactions.
--   announcement_comments: flat (one-level) comments, soft-deleted via deleted_at.
--   announcement_reactions: emoji on EITHER an announcement or a comment
--     (exactly one target, enforced by a CHECK). Partial unique indexes dedupe
--     per target type (a single index can't, since NULL != NULL).
CREATE TABLE IF NOT EXISTS "announcement_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "announcement_id" uuid NOT NULL,
  "author_id" uuid NOT NULL,
  "body" text NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "announcement_reactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "announcement_id" uuid,
  "comment_id" uuid,
  "user_id" uuid NOT NULL,
  "emoji" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "announcement_reactions_one_target" CHECK (("announcement_id" IS NOT NULL) <> ("comment_id" IS NOT NULL))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcement_comments" ADD CONSTRAINT "announcement_comments_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcement_comments" ADD CONSTRAINT "announcement_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcement_reactions" ADD CONSTRAINT "announcement_reactions_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcement_reactions" ADD CONSTRAINT "announcement_reactions_comment_id_announcement_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "announcement_comments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcement_reactions" ADD CONSTRAINT "announcement_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "announcement_comments_announcement_idx" ON "announcement_comments" ("announcement_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "announcement_reactions_ann_user_emoji_idx" ON "announcement_reactions" ("announcement_id", "user_id", "emoji") WHERE "comment_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "announcement_reactions_comment_user_emoji_idx" ON "announcement_reactions" ("comment_id", "user_id", "emoji") WHERE "announcement_id" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "announcement_reactions_ann_idx" ON "announcement_reactions" ("announcement_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "announcement_reactions_comment_idx" ON "announcement_reactions" ("comment_id");
